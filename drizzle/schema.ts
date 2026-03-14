import { pgTable, pgSchema, AnyPgColumn, integer, serial, date, varchar, text, timestamp, smallint, index, numeric, json, boolean, real } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const accidents = pgTable("accidents", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataAcidente: date({ mode: 'string' }).notNull(),
        horaAcidente: varchar({ length: 10 }),
        tipoAcidente: text().notNull(),
        gravidade: text().notNull(),
        localAcidente: varchar({ length: 255 }),
        descricao: text(),
        parteCorpoAtingida: varchar({ length: 255 }),
        catNumero: varchar({ length: 50 }),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        catData: date({ mode: 'string' }),
        diasAfastamento: integer().default(0),
        testemunhas: text(),
        acaoCorretiva: text(),
        documentoUrl: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const actionPlans = pgTable("action_plans", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        deviationId: integer(),
        oQue: text().notNull(),
        porQue: text(),
        onde: varchar({ length: 255 }),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        quando: date({ mode: 'string' }),
        quem: varchar({ length: 255 }),
        como: text(),
        quantoCusta: varchar({ length: 50 }),
        statusPlano: text().default('Pendente').notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataConclusao: date({ mode: 'string' }),
        evidencia: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const advances = pgTable("advances", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        mesReferencia: varchar({ length: 7 }).notNull(),
        valorAdiantamento: varchar({ length: 20 }),
        valorLiquido: varchar({ length: 20 }),
        descontoIr: varchar({ length: 20 }),
        bancoDestino: varchar({ length: 100 }),
        diasFaltas: integer().default(0),
        aprovado: text().default('Pendente').notNull(),
        motivoReprovacao: text(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataPagamento: date({ mode: 'string' }),
        observacoes: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const asos = pgTable("asos", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        tipo: varchar({ length: 50 }).notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataExame: date({ mode: 'string' }).notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataValidade: date({ mode: 'string' }).notNull(),
        validadeDias: integer().default(365),
        resultado: varchar({ length: 50 }).default('Apto').notNull(),
        medico: varchar({ length: 255 }),
        crm: varchar({ length: 20 }),
        examesRealizados: text(),
        jaAtualizou: smallint().default(0),
        clinica: varchar({ length: 255 }),
        observacoes: text(),
        documentoUrl: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        deletedAt: timestamp({ mode: 'string' }),
        deletedBy: varchar({ length: 255 }),
        deletedByUserId: integer(),
},
(table) => [
        index("idx_aso_company").on(table.companyId),
        index("idx_aso_employee").on(table.employeeId),
        index("idx_aso_validade").on(table.companyId, table.dataValidade),
]);

export const atestados = pgTable("atestados", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        tipo: varchar({ length: 100 }).notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataEmissao: date({ mode: 'string' }).notNull(),
        diasAfastamento: integer().default(0),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataRetorno: date({ mode: 'string' }),
        cid: varchar({ length: 20 }),
        medico: varchar({ length: 255 }),
        crm: varchar({ length: 20 }),
        descricao: text(),
        motivo: varchar({ length: 100 }),
        motivoOutro: text(),
        documentoUrl: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        deletedAt: timestamp({ mode: 'string' }),
        deletedBy: varchar({ length: 255 }),
        deletedByUserId: integer(),
});

export const auditLogs = pgTable("audit_logs", {
        id: serial().notNull(),
        userId: integer(),
        userName: varchar({ length: 255 }),
        companyId: integer(),
        action: varchar({ length: 50 }).notNull(),
        module: varchar({ length: 50 }).notNull(),
        entityType: varchar({ length: 50 }),
        entityId: integer(),
        details: text(),
        ipAddress: varchar({ length: 45 }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const audits = pgTable("audits", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        titulo: varchar({ length: 255 }).notNull(),
        tipoAuditoria: text().notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataAuditoria: date({ mode: 'string' }).notNull(),
        auditor: varchar({ length: 255 }),
        setor: varchar({ length: 100 }),
        resultadoAuditoria: text().default('Pendente').notNull(),
        descricao: text(),
        documentoUrl: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const avaliacaoAvaliadores = pgTable("avaliacao_avaliadores", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        avaliadorUserId: integer().notNull(),
        employeeId: integer().notNull(),
        ativo: smallint().default(1).notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("aa_company").on(table.companyId),
        index("aa_avaliador").on(table.avaliadorUserId),
        index("aa_employee").on(table.employeeId),
]);

export const avaliacaoCiclos = pgTable("avaliacao_ciclos", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        questionarioId: integer().notNull(),
        titulo: varchar({ length: 255 }).notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataInicio: date({ mode: 'string' }).notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataFim: date({ mode: 'string' }).notNull(),
        status: text().default('rascunho').notNull(),
        criadoPor: integer().notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("ac_company").on(table.companyId),
        index("ac_questionario").on(table.questionarioId),
]);

export const avaliacaoConfig = pgTable("avaliacao_config", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        notaMinima: numeric({ precision: 5, scale: 2 }).default('0'),
        notaMaxima: numeric({ precision: 5, scale: 2 }).default('5'),
        permitirAutoAvaliacao: smallint().default(0),
        exibirRankingParaAvaliadores: smallint().default(0),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("acfg_company").on(table.companyId),
]);

export const avaliacaoPerguntas = pgTable("avaliacao_perguntas", {
        id: serial().notNull(),
        questionarioId: integer().notNull(),
        texto: text().notNull(),
        tipo: text().default('nota_1_5').notNull(),
        peso: integer().default(1).notNull(),
        ordem: integer().default(0).notNull(),
        ativo: smallint().default(1).notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("ap_questionario").on(table.questionarioId),
]);

export const avaliacaoQuestionarios = pgTable("avaliacao_questionarios", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        titulo: varchar({ length: 255 }).notNull(),
        descricao: text(),
        frequencia: text().default('mensal').notNull(),
        ativo: smallint().default(1).notNull(),
        criadoPor: integer().notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("aq_company").on(table.companyId),
]);

export const avaliacaoRespostas = pgTable("avaliacao_respostas", {
        id: serial().notNull(),
        avaliacaoId: integer().notNull(),
        perguntaId: integer().notNull(),
        valor: varchar({ length: 20 }),
        textoLivre: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("ar_avaliacao").on(table.avaliacaoId),
        index("ar_pergunta").on(table.perguntaId),
]);

export const avaliacoes = pgTable("avaliacoes", {
        id: serial().notNull(),
        cicloId: integer().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        avaliadorId: integer().notNull(),
        avaliadorNome: varchar({ length: 255 }),
        status: text().default('pendente').notNull(),
        notaFinal: numeric({ precision: 5, scale: 2 }),
        observacoes: text(),
        tempoAvaliacao: integer(),
        finalizadaEm: timestamp({ mode: 'string' }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("av_ciclo").on(table.cicloId),
        index("av_company").on(table.companyId),
        index("av_employee").on(table.employeeId),
        index("av_avaliador").on(table.avaliadorId),
]);

export const blacklistReactivationRequests = pgTable("blacklist_reactivation_requests", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        employeeName: varchar({ length: 255 }).notNull(),
        employeeCpf: varchar({ length: 14 }),
        solicitadoPor: varchar({ length: 255 }).notNull(),
        solicitadoPorId: integer().notNull(),
        motivoReativacao: text().notNull(),
        status: text().default('pendente').notNull(),
        aprovador1Nome: varchar({ length: 255 }),
        aprovador1Id: integer(),
        aprovador1Data: timestamp({ mode: 'string' }),
        aprovador1Parecer: text(),
        aprovador2Nome: varchar({ length: 255 }),
        aprovador2Id: integer(),
        aprovador2Data: timestamp({ mode: 'string' }),
        aprovador2Parecer: text(),
        rejeitadoPor: varchar({ length: 255 }),
        rejeitadoPorId: integer(),
        motivoRejeicao: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("brr_company").on(table.companyId),
        index("brr_employee").on(table.employeeId),
        index("brr_status").on(table.companyId, table.status),
]);

export const caepiDatabase = pgTable("caepi_database", {
        id: serial().notNull(),
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
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("caepi_ca_idx").on(table.ca),
]);

export const chemicals = pgTable("chemicals", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        nome: varchar({ length: 255 }).notNull(),
        fabricante: varchar({ length: 255 }),
        numeroCas: varchar({ length: 50 }),
        classificacaoPerigo: varchar({ length: 255 }),
        localArmazenamento: varchar({ length: 255 }),
        quantidadeEstoque: varchar({ length: 50 }),
        fispqUrl: text(),
        observacoes: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const cipaElections = pgTable("cipa_elections", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        mandatoInicio: date({ mode: 'string' }).notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        mandatoFim: date({ mode: 'string' }).notNull(),
        statusEleicao: text().default('Planejamento').notNull(),
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
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const cipaMeetings = pgTable("cipa_meetings", {
        id: serial().notNull(),
        mandateId: integer().notNull(),
        companyId: integer().notNull(),
        tipo: text().default('ordinaria').notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataReuniao: date({ mode: 'string' }).notNull(),
        horaInicio: varchar({ length: 10 }),
        horaFim: varchar({ length: 10 }),
        local: varchar({ length: 255 }),
        pauta: text(),
        ataTexto: text(),
        ataDocumentoUrl: text(),
        presentesJson: text(),
        status: text().default('agendada').notNull(),
        observacoes: text(),
        criadoPor: varchar({ length: 255 }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("cmt_mandate").on(table.mandateId),
        index("cmt_company").on(table.companyId),
        index("cmt_data").on(table.dataReuniao),
]);

export const cipaMembers = pgTable("cipa_members", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        electionId: integer().notNull(),
        employeeId: integer().notNull(),
        cargoCipa: text().notNull(),
        representacao: text().notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        inicioEstabilidade: date({ mode: 'string' }),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        fimEstabilidade: date({ mode: 'string' }),
        statusMembro: text().default('Ativo').notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const companies = pgTable("companies", {
        id: serial().notNull(),
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
        site: varchar({ length: 255 }),
        grupoEmpresarial: varchar({ length: 100 }),
        isActive: smallint().default(1).notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        prefixoCodigo: varchar({ length: 10 }).default('EMP'),
        nextCodigoInterno: integer().default(1).notNull(),
        numerosProibidos: varchar({ length: 500 }).default('13,17,22,24,69,171,666'),
        deletedAt: timestamp({ mode: 'string' }),
        deletedBy: varchar({ length: 255 }),
        deletedByUserId: integer(),
        inscricaoEstadual: varchar({ length: 30 }),
        inscricaoMunicipal: varchar({ length: 30 }),
        compartilhaRecursos: smallint().default(0).notNull(),
},
(table) => [
        index("companies_cnpj_unique").on(table.cnpj),
]);

export const companyBankAccounts = pgTable("company_bank_accounts", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        banco: varchar({ length: 100 }).notNull(),
        codigoBanco: varchar({ length: 10 }),
        agencia: varchar({ length: 20 }).notNull(),
        conta: varchar({ length: 30 }).notNull(),
        tipoConta: text().default('corrente').notNull(),
        apelido: varchar({ length: 100 }),
        cnpjTitular: varchar({ length: 20 }),
        ativo: smallint().default(1).notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        deletedAt: timestamp({ mode: 'string' }),
        deletedBy: varchar({ length: 255 }),
        deletedByUserId: integer(),
},
(table) => [
        index("cba_company").on(table.companyId),
]);

export const companyDocuments = pgTable("company_documents", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        tipo: text().notNull(),
        nome: varchar({ length: 255 }).notNull(),
        descricao: text(),
        documentoUrl: text(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataEmissao: date({ mode: 'string' }),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataValidade: date({ mode: 'string' }),
        elaboradoPor: varchar({ length: 255 }),
        status: text().default('pendente').notNull(),
        observacoes: text(),
        criadoPor: varchar({ length: 255 }),
        criadoPorUserId: integer(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("cd_company").on(table.companyId),
        index("cd_tipo").on(table.tipo),
        index("cd_validade").on(table.dataValidade),
]);

export const convencaoColetiva = pgTable("convencao_coletiva", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        obraId: integer(),
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
        isMatriz: smallint().default(0).notNull(),
        status: text().default('vigente').notNull(),
        observacoes: text(),
        criadoPor: varchar({ length: 255 }),
        criadoPorUserId: integer(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("cc_company").on(table.companyId),
        index("cc_obra").on(table.obraId),
        index("cc_vigencia").on(table.vigenciaInicio, table.vigenciaFim),
]);

export const customExams = pgTable("custom_exams", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        nome: varchar({ length: 255 }).notNull(),
        criadoPor: varchar({ length: 255 }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("ce_company").on(table.companyId),
        index("unique_exam").on(table.companyId, table.nome),
]);

export const datajudAlerts = pgTable("datajud_alerts", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        processoId: integer(),
        tipo: text().notNull(),
        titulo: varchar({ length: 255 }).notNull(),
        descricao: text(),
        prioridade: text().default('media').notNull(),
        lido: smallint().default(0).notNull(),
        lidoPor: varchar({ length: 255 }),
        lidoEm: timestamp({ mode: 'string' }),
        dados: json(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("dja_company").on(table.companyId),
        index("dja_company_lido").on(table.companyId, table.lido),
        index("dja_processo").on(table.processoId),
]);

export const datajudAutoCheckConfig = pgTable("datajud_auto_check_config", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        isActive: smallint().default(1).notNull(),
        intervaloMinutos: integer().default(60).notNull(),
        ultimaVerificacao: timestamp({ mode: 'string' }),
        totalVerificacoes: integer().default(0).notNull(),
        totalAlertas: integer().default(0).notNull(),
        criadoPor: varchar({ length: 255 }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("djac_company").on(table.companyId),
]);

export const dds = pgTable("dds", {
        id: serial().notNull(),
        companyId: integer().notNull(),
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

export const deviations = pgTable("deviations", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        auditId: integer(),
        titulo: varchar({ length: 255 }).notNull(),
        tipoDesvio: text().notNull(),
        setor: varchar({ length: 100 }),
        descricao: text(),
        causaRaiz: text(),
        statusDesvio: text().default('Aberto').notNull(),
        responsavel: varchar({ length: 255 }),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        prazo: date({ mode: 'string' }),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataConclusao: date({ mode: 'string' }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const dissidioFuncionarios = pgTable("dissidio_funcionarios", {
        id: serial().notNull(),
        dissidioId: integer().notNull(),
        employeeId: integer().notNull(),
        companyId: integer().notNull(),
        salarioAnterior: varchar({ length: 20 }).notNull(),
        salarioNovo: varchar({ length: 20 }).notNull(),
        percentualAplicado: varchar({ length: 10 }).notNull(),
        diferencaValor: varchar({ length: 20 }),
        mesesRetroativos: integer().default(0),
        valorRetroativo: varchar({ length: 20 }),
        status: text().default('pendente').notNull(),
        motivoExclusao: text(),
        aplicadoEm: timestamp({ mode: 'string' }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("df_dissidio").on(table.dissidioId),
        index("df_employee").on(table.employeeId),
        index("df_company").on(table.companyId),
]);

export const dissidios = pgTable("dissidios", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        anoReferencia: integer().notNull(),
        titulo: varchar({ length: 255 }).notNull(),
        sindicato: varchar({ length: 255 }),
        numeroCct: varchar({ length: 100 }),
        mesDataBase: integer().default(5).notNull(),
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
        retroativo: smallint().default(1).notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataRetroativoInicio: date({ mode: 'string' }),
        status: text().default('rascunho').notNull(),
        observacoes: text(),
        documentoUrl: text(),
        criadoPor: varchar({ length: 255 }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("diss_company_ano").on(table.companyId, table.anoReferencia),
        index("diss_status").on(table.companyId, table.status),
]);

export const dixiAfdImportacoes = pgTable("dixi_afd_importacoes", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        dataImportacao: timestamp({ mode: 'string' }).defaultNow().notNull(),
        metodo: text().default('AFD').notNull(),
        arquivoNome: varchar({ length: 255 }),
        snRelogio: varchar({ length: 50 }),
        obraId: integer(),
        obraNome: varchar({ length: 255 }),
        totalMarcacoes: integer().default(0).notNull(),
        totalFuncionarios: integer().default(0).notNull(),
        totalInconsistencias: integer().default(0).notNull(),
        periodoInicio: varchar({ length: 10 }),
        periodoFim: varchar({ length: 10 }),
        status: text().default('sucesso').notNull(),
        importadoPor: varchar({ length: 255 }),
        detalhes: json(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("dai_company").on(table.companyId),
        index("dai_sn").on(table.snRelogio),
        index("dai_data").on(table.dataImportacao),
]);

export const dixiAfdMarcacoes = pgTable("dixi_afd_marcacoes", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        importacaoId: integer().notNull(),
        nsr: varchar({ length: 20 }),
        cpf: varchar({ length: 14 }).notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        data: date({ mode: 'string' }).notNull(),
        hora: varchar({ length: 10 }).notNull(),
        snRelogio: varchar({ length: 50 }),
        obraId: integer(),
        employeeId: integer(),
        employeeName: varchar({ length: 255 }),
        status: text().default('processado').notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("dam_company").on(table.companyId),
        index("dam_importacao").on(table.importacaoId),
        index("dam_cpf").on(table.cpf),
        index("dam_data").on(table.data),
        index("dam_employee").on(table.employeeId),
]);

export const dixiDevices = pgTable("dixi_devices", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        serialNumber: varchar({ length: 50 }).notNull(),
        obraName: varchar({ length: 255 }).notNull(),
        location: text(),
        isActive: smallint().default(1).notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        obraId: integer(),
        deletedAt: timestamp({ mode: 'string' }),
        deletedBy: varchar({ length: 255 }),
        deletedByUserId: integer(),
});

export const dixiNameMappings = pgTable("dixi_name_mappings", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        dixiName: varchar({ length: 255 }).notNull(),
        dixiId: varchar({ length: 50 }),
        employeeId: integer().notNull(),
        employeeName: varchar({ length: 255 }).notNull(),
        source: text().default('manual').notNull(),
        createdBy: varchar({ length: 255 }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("dnm_company").on(table.companyId),
        index("dnm_dixi_name").on(table.companyId, table.dixiName),
        index("dnm_employee").on(table.employeeId),
]);

export const documentTemplates = pgTable("document_templates", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        tipo: text().notNull(),
        titulo: varchar({ length: 255 }).notNull(),
        conteudo: text().notNull(),
        ativo: smallint().default(1).notNull(),
        criadoPor: varchar({ length: 255 }),
        atualizadoPor: varchar({ length: 255 }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        deletedAt: timestamp({ mode: 'string' }),
        deletedBy: varchar({ length: 255 }),
        deletedByUserId: integer(),
},
(table) => [
        index("doc_templates_company_tipo").on(table.companyId, table.tipo),
]);

export const emailTemplates = pgTable("email_templates", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        tipo: varchar({ length: 50 }).notNull(),
        assunto: varchar({ length: 255 }).notNull(),
        corpo: text().notNull(),
        ativo: smallint().default(1).notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const employeeAptidao = pgTable("employee_aptidao", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        status: text().default('pendente').notNull(),
        motivoInapto: text(),
        ultimaVerificacao: timestamp({ mode: 'string' }),
        asoVigente: smallint().default(0).notNull(),
        treinamentosObrigatoriosOk: smallint().default(0).notNull(),
        documentosPessoaisOk: smallint().default(0).notNull(),
        nrObrigatoriasOk: smallint().default(0).notNull(),
        verificadoPor: varchar({ length: 255 }),
        verificadoPorUserId: integer(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("ea_company").on(table.companyId),
        index("ea_employee").on(table.employeeId),
        index("ea_status").on(table.status),
]);

export const employeeDocuments = pgTable("employee_documents", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        tipo: text().notNull(),
        nome: varchar({ length: 255 }).notNull(),
        descricao: varchar({ length: 500 }),
        fileUrl: text().notNull(),
        fileKey: text().notNull(),
        mimeType: varchar({ length: 100 }),
        fileSize: integer(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataValidade: date({ mode: 'string' }),
        uploadPor: varchar({ length: 255 }),
        uploadPorUserId: integer(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        deletedAt: timestamp({ mode: 'string' }),
        deletedBy: varchar({ length: 255 }),
},
(table) => [
        index("edoc_company").on(table.companyId),
        index("edoc_employee").on(table.employeeId),
        index("edoc_tipo").on(table.tipo),
]);

export const employeeHistory = pgTable("employee_history", {
        id: serial().notNull(),
        employeeId: integer().notNull(),
        companyId: integer().notNull(),
        tipo: text().notNull(),
        descricao: text(),
        valorAnterior: text(),
        valorNovo: text(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataEvento: date({ mode: 'string' }).notNull(),
        registradoPor: integer(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const employeeSiteHistory = pgTable("employee_site_history", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        obraId: integer().notNull(),
        tipo: text().notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataInicio: date({ mode: 'string' }).notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataFim: date({ mode: 'string' }),
        motivoTransferencia: text(),
        obraOrigemId: integer(),
        registradoPor: varchar({ length: 255 }),
        registradoPorUserId: integer(),
        observacoes: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("esh_company").on(table.companyId),
        index("esh_employee").on(table.employeeId),
        index("esh_obra").on(table.obraId),
        index("esh_data").on(table.dataInicio, table.dataFim),
]);

export const employees = pgTable("employees", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        matricula: varchar({ length: 20 }),
        nomeCompleto: varchar({ length: 255 }).notNull(),
        cpf: varchar({ length: 14 }).notNull(),
        rg: varchar({ length: 20 }),
        orgaoEmissor: varchar({ length: 20 }),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataNascimento: date({ mode: 'string' }),
        sexo: text(),
        estadoCivil: text(),
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
        tipoContrato: text(),
        jornadaTrabalho: text(),
        banco: varchar({ length: 100 }),
        bancoNome: varchar({ length: 100 }),
        agencia: varchar({ length: 20 }),
        conta: varchar({ length: 30 }),
        tipoConta: text(),
        tipoChavePix: text(),
        chavePix: varchar({ length: 100 }),
        contaPix: varchar({ length: 100 }),
        bancoPix: varchar({ length: 100 }),
        status: text().default('Ativo').notNull(),
        fotoUrl: text(),
        observacoes: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        listaNegra: smallint().default(0).notNull(),
        motivoListaNegra: text(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataListaNegra: date({ mode: 'string' }),
        codigoContabil: varchar({ length: 20 }),
        codigoInterno: varchar({ length: 10 }),
        recebeComplemento: smallint().default(0).notNull(),
        valorComplemento: varchar({ length: 20 }),
        descricaoComplemento: varchar({ length: 255 }),
        acordoHoraExtra: smallint().default(0).notNull(),
        heNormal50: varchar({ length: 10 }).default('50'),
        heNoturna: varchar({ length: 10 }).default('20'),
        he100: varchar({ length: 10 }).default('100'),
        heFeriado: varchar({ length: 10 }).default('100'),
        heInterjornada: varchar({ length: 10 }).default('50'),
        obsAcordoHe: text(),
        contaBancariaEmpresaId: integer(),
        listaNegraPor: varchar({ length: 255 }),
        listaNegraUserId: integer(),
        desligadoPor: varchar({ length: 255 }),
        desligadoUserId: integer(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataDesligamentoEfetiva: date({ mode: 'string' }),
        motivoDesligamento: text(),
        categoriaDesligamento: varchar({ length: 50 }),
        deletedAt: timestamp({ mode: 'string' }),
        deletedBy: varchar({ length: 255 }),
        deletedByUserId: integer(),
        deleteReason: text(),
        experienciaTipo: text(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        experienciaInicio: date({ mode: 'string' }),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        experienciaFim1: date({ mode: 'string' }),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        experienciaFim2: date({ mode: 'string' }),
        experienciaStatus: text().default('em_experiencia'),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        experienciaProrrogadoEm: date({ mode: 'string' }),
        experienciaProrrogadoPor: varchar({ length: 255 }),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        experienciaEfetivadoEm: date({ mode: 'string' }),
        experienciaEfetivadoPor: varchar({ length: 255 }),
        experienciaObs: text(),
        vtTipo: text(),
        vtValorDiario: varchar({ length: 20 }),
        vtOperadora: varchar({ length: 100 }),
        vtLinhas: varchar({ length: 255 }),
        vtDescontoFolha: varchar({ length: 20 }),
        pensaoAlimenticia: smallint().default(0),
        pensaoValor: varchar({ length: 20 }),
        pensaoTipo: text(),
        pensaoPercentual: varchar({ length: 10 }),
        pensaoBeneficiario: varchar({ length: 255 }),
        pensaoBanco: varchar({ length: 100 }),
        pensaoAgencia: varchar({ length: 20 }),
        pensaoConta: varchar({ length: 30 }),
        pensaoObservacoes: text(),
        licencaMaternidade: smallint().default(0),
        licencaTipo: text(),
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
        ddsParticipacao: smallint().default(1),
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
        index("idx_emp_company").on(table.companyId),
        index("idx_emp_status").on(table.companyId, table.status),

]);

export const epiDeliveries = pgTable("epi_deliveries", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        epiId: integer().notNull(),
        employeeId: integer().notNull(),
        quantidade: integer().default(1).notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataEntrega: date({ mode: 'string' }).notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataDevolucao: date({ mode: 'string' }),
        motivo: varchar({ length: 255 }),
        observacoes: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        deletedAt: timestamp({ mode: 'string' }),
        deletedBy: varchar({ length: 255 }),
        deletedByUserId: integer(),
        motivoTroca: varchar("motivo_troca", { length: 50 }),
        valorCobrado: numeric("valor_cobrado", { precision: 10, scale: 2 }),
        fichaUrl: text("ficha_url"),
        fotoEstadoUrl: text("foto_estado_url"),
        origemEntrega: text().default('central').notNull(),
        obraId: integer(),
        dataValidade: date("data_validade", { mode: 'string' }),
        assinaturaUrl: text("assinatura_url"),
},
(table) => [
        index("idx_ed_company").on(table.companyId),
        index("idx_ed_employee").on(table.employeeId),
        index("idx_ed_epi").on(table.epiId),
        index("idx_ed_origem").on(table.origemEntrega),
        index("idx_ed_obra").on(table.obraId),
]);

export const epiDiscountAlerts = pgTable("epi_discount_alerts", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        epiDeliveryId: integer().notNull(),
        epiNome: varchar("epi_nome", { length: 1000 }).notNull(),
        ca: varchar({ length: 20 }),
        quantidade: integer().default(1).notNull(),
        valorUnitario: numeric("valor_unitario", { precision: 10, scale: 2 }).notNull(),
        valorTotal: numeric("valor_total", { precision: 10, scale: 2 }).notNull(),
        motivoCobranca: varchar("motivo_cobranca", { length: 100 }).notNull(),
        mesReferencia: varchar("mes_referencia", { length: 7 }).notNull(),
        status: text().default('pendente').notNull(),
        validadoPor: varchar("validado_por", { length: 255 }),
        validadoPorUserId: integer(),
        dataValidacao: timestamp("data_validacao", { mode: 'string' }),
        justificativa: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("eda_company").on(table.companyId),
        index("eda_employee").on(table.employeeId),
        index("eda_delivery").on(table.epiDeliveryId),
        index("eda_status").on(table.status),
        index("eda_mes").on(table.companyId, table.mesReferencia),
]);

export const epis = pgTable("epis", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        nome: varchar({ length: 1000 }).notNull(),
        ca: varchar({ length: 20 }),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        validadeCa: date({ mode: 'string' }),
        fabricante: varchar({ length: 255 }),
        fornecedor: varchar({ length: 255 }),
        quantidadeEstoque: integer().default(0),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        valorProduto: numeric("valor_produto", { precision: 10, scale: 2 }),
        tempoMinimoTroca: integer(),
        vidaUtilMeses: integer(),
        categoria: text().default('EPI').notNull(),
        tamanho: varchar({ length: 20 }),
        fornecedorCnpj: varchar("fornecedor_cnpj", { length: 20 }),
        fornecedorContato: varchar("fornecedor_contato", { length: 255 }),
        fornecedorTelefone: varchar("fornecedor_telefone", { length: 30 }),
        fornecedorEmail: varchar("fornecedor_email", { length: 255 }),
        fornecedorEndereco: varchar("fornecedor_endereco", { length: 500 }),
        corCapacete: varchar("cor_capacete", { length: 30 }),
        condicao: text().default('Novo').notNull(),
        criadoPor: varchar("criado_por", { length: 255 }),
        alteradoPor: varchar("alterado_por", { length: 255 }),
});

// Estoque de EPI por Obra
export const epiEstoqueObra = pgTable("epi_estoque_obra", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        epiId: integer().notNull(),
        obraId: integer().notNull(),
        quantidade: integer().default(0).notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        criadoPor: varchar("criado_por", { length: 255 }),
        alteradoPor: varchar("alterado_por", { length: 255 }),
},
(table) => [
        index("idx_eeo_company").on(table.companyId),
        index("idx_eeo_epi").on(table.epiId),
        index("idx_eeo_obra").on(table.obraId),
        index("idx_eeo_epi_obra").on(table.epiId, table.obraId),
]);

// Transferências de EPI (central → obra, obra → obra)
export const epiTransferencias = pgTable("epi_transferencias", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        epiId: integer().notNull(),
        quantidade: integer().notNull(),
        tipoOrigem: text().notNull(),
        origemObraId: integer(),
        destinoObraId: integer().notNull(),
        data: date({ mode: 'string' }).notNull(),
        observacoes: text(),
        criadoPor: varchar("criado_por", { length: 255 }),
        criadoPorUserId: integer(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("idx_et_company").on(table.companyId),
        index("idx_et_epi").on(table.epiId),
        index("idx_et_destino").on(table.destinoObraId),
        index("idx_et_data").on(table.companyId, table.data),
]);

export const equipment = pgTable("equipment", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        nome: varchar({ length: 255 }).notNull(),
        patrimonio: varchar({ length: 50 }),
        tipoEquipamento: varchar({ length: 100 }),
        marca: varchar({ length: 100 }),
        modelo: varchar({ length: 100 }),
        numeroSerie: varchar({ length: 100 }),
        localizacao: varchar({ length: 255 }),
        responsavel: varchar({ length: 255 }),
        statusEquipamento: text().default('Ativo').notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataAquisicao: date({ mode: 'string' }),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        proximaManutencao: date({ mode: 'string' }),
        observacoes: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const evalAuditLog = pgTable("eval_audit_log", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        action: varchar({ length: 100 }).notNull(),
        actorType: text().default('system').notNull(),
        actorId: integer(),
        actorName: varchar({ length: 255 }),
        targetType: varchar({ length: 50 }),
        targetId: integer(),
        details: text(),
        ipAddress: varchar({ length: 45 }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("eal_company").on(table.companyId),
        index("eal_action").on(table.action),
        index("eal_actor").on(table.actorType, table.actorId),
]);

export const evalAvaliacoes = pgTable("eval_avaliacoes", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        evaluatorId: integer().notNull(),
        comportamento: integer(),
        pontualidade: integer(),
        assiduidade: integer(),
        segurancaEpis: integer(),
        qualidadeAcabamento: integer(),
        produtividadeRitmo: integer(),
        cuidadoFerramentas: integer(),
        economiaMateriais: integer(),
        trabalhoEquipe: integer(),
        iniciativaProatividade: integer(),
        disponibilidadeFlexibilidade: integer(),
        organizacaoLimpeza: integer(),
        mediaPilar1: numeric({ precision: 3, scale: 1 }),
        mediaPilar2: numeric({ precision: 3, scale: 1 }),
        mediaPilar3: numeric({ precision: 3, scale: 1 }),
        mediaGeral: numeric({ precision: 3, scale: 1 }),
        recomendacao: varchar({ length: 100 }),
        observacoes: text(),
        mesReferencia: varchar({ length: 7 }),
        locked: smallint().default(1).notNull(),
        startedAt: timestamp({ mode: 'string' }),
        durationSeconds: integer(),
        deviceType: varchar({ length: 20 }),
        revisionId: integer(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        obraId: integer(),
        evaluatorName: varchar("evaluator_name", { length: 255 }),
},
(table) => [
        index("eav_company").on(table.companyId),
        index("eav_employee").on(table.employeeId),
        index("eav_evaluator").on(table.evaluatorId),
        index("eav_mes").on(table.mesReferencia),
]);

export const evalAvaliadores = pgTable("eval_avaliadores", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        userId: integer(),
        nome: varchar({ length: 255 }).notNull(),
        email: varchar({ length: 320 }).notNull(),
        passwordHash: varchar({ length: 255 }).notNull(),
        emailVerified: smallint().default(0),
        mustChangePassword: smallint().default(1),
        obraId: integer(),
        evaluationFrequency: text().default('monthly').notNull(),
        status: text().default('ativo').notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        lastSignedIn: timestamp({ mode: 'string' }),
},
(table) => [
        index("eva_company").on(table.companyId),
        index("eva_email").on(table.email),
]);

export const evalClimateAnswers = pgTable("eval_climate_answers", {
        id: serial().notNull(),
        responseId: integer().notNull(),
        questionId: integer().notNull(),
        valor: varchar({ length: 20 }),
        textoLivre: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("ecla_response").on(table.responseId),
        index("ecla_question").on(table.questionId),
]);

export const evalClimateExternalTokens = pgTable("eval_climate_external_tokens", {
        id: serial().notNull(),
        surveyId: integer().notNull(),
        participantId: integer().notNull(),
        token: varchar({ length: 64 }).notNull(),
        used: smallint().default(0),
        usedAt: timestamp({ mode: 'string' }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("ecet_survey").on(table.surveyId),
        index("ecet_token").on(table.token),
]);

export const evalClimateQuestions = pgTable("eval_climate_questions", {
        id: serial().notNull(),
        surveyId: integer().notNull(),
        texto: text().notNull(),
        categoria: text().default('empresa').notNull(),
        tipo: text().default('nota').notNull(),
        ordem: integer().default(0).notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("ecq_survey").on(table.surveyId),
]);

export const evalClimateResponses = pgTable("eval_climate_responses", {
        id: serial().notNull(),
        surveyId: integer().notNull(),
        cpfHash: varchar({ length: 64 }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("eclr_survey").on(table.surveyId),
]);

export const evalClimateSurveys = pgTable("eval_climate_surveys", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        titulo: varchar({ length: 255 }).notNull(),
        descricao: text(),
        status: text().default('rascunho').notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        publicToken: varchar("public_token", { length: 64 }),
        expiresAt: timestamp("expires_at", { mode: 'string' }),
},
(table) => [
        index("ecs_company").on(table.companyId),
]);

export const evalCriteria = pgTable("eval_criteria", {
        id: serial().notNull(),
        pillarId: integer().notNull(),
        revisionId: integer().notNull(),
        nome: varchar({ length: 255 }).notNull(),
        descricao: text(),
        fieldKey: varchar({ length: 100 }),
        ordem: integer().default(0).notNull(),
        ativo: smallint().default(1).notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("ec_pillar").on(table.pillarId),
        index("ec_revision").on(table.revisionId),
]);

export const evalCriteriaRevisions = pgTable("eval_criteria_revisions", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        version: integer().default(1).notNull(),
        descricao: varchar({ length: 255 }),
        isActive: smallint().default(0).notNull(),
        createdBy: varchar({ length: 255 }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("ecr_company").on(table.companyId),
]);

export const evalExternalParticipants = pgTable("eval_external_participants", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        nome: varchar({ length: 255 }).notNull(),
        empresa: varchar({ length: 255 }),
        tipo: text().default('cliente').notNull(),
        email: varchar({ length: 320 }),
        telefone: varchar({ length: 20 }),
        status: text().default('ativo').notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("eep_company").on(table.companyId),
]);

export const evalPillars = pgTable("eval_pillars", {
        id: serial().notNull(),
        revisionId: integer().notNull(),
        nome: varchar({ length: 255 }).notNull(),
        ordem: integer().default(0).notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("ep_revision").on(table.revisionId),
]);

export const evalScores = pgTable("eval_scores", {
        id: serial().notNull(),
        evaluationId: integer().notNull(),
        criterionId: integer().notNull(),
        nota: integer().notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("es_evaluation").on(table.evaluationId),
        index("es_criterion").on(table.criterionId),
]);

export const evalSurveyAnswers = pgTable("eval_survey_answers", {
        id: serial().notNull(),
        responseId: integer().notNull(),
        questionId: integer().notNull(),
        valor: varchar({ length: 20 }),
        textoLivre: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("esa_response").on(table.responseId),
        index("esa_question").on(table.questionId),
]);

export const evalSurveyEvaluators = pgTable("eval_survey_evaluators", {
        id: serial().notNull(),
        surveyId: integer().notNull(),
        evaluatorId: integer().notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("ese_survey").on(table.surveyId),
        index("ese_evaluator").on(table.evaluatorId),
]);

export const evalSurveyQuestions = pgTable("eval_survey_questions", {
        id: serial().notNull(),
        surveyId: integer().notNull(),
        texto: text().notNull(),
        tipo: text().default('nota').notNull(),
        ordem: integer().default(0).notNull(),
        obrigatoria: smallint().default(1),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("esq_survey").on(table.surveyId),
]);

export const evalSurveyResponses = pgTable("eval_survey_responses", {
        id: serial().notNull(),
        surveyId: integer().notNull(),
        respondentName: varchar({ length: 255 }),
        respondentEmail: varchar({ length: 320 }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        employeeId: integer(),
        evaluatorUserId: integer(),
},
(table) => [
        index("esr_survey").on(table.surveyId),
]);

export const evalSurveys = pgTable("eval_surveys", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        titulo: varchar({ length: 255 }).notNull(),
        descricao: text(),
        tipo: text().default('outro').notNull(),
        anonimo: smallint().default(0),
        status: text().default('rascunho').notNull(),
        obraId: integer(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        publicToken: varchar("public_token", { length: 64 }),
        expiresAt: timestamp("expires_at", { mode: 'string' }),
        isEvaluation: smallint().default(0),
        allowEmployeeSelection: smallint().default(1),
},
(table) => [
        index("esu_company").on(table.companyId),
]);

export const extinguishers = pgTable("extinguishers", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        numero: varchar({ length: 20 }).notNull(),
        tipoExtintor: text().notNull(),
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
        statusExtintor: text().default('OK').notNull(),
        observacoes: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const extraPayments = pgTable("extra_payments", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        mesReferencia: varchar({ length: 7 }).notNull(),
        tipoExtra: text().notNull(),
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
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const feriados = pgTable("feriados", {
        id: serial().notNull(),
        companyId: integer(),
        nome: varchar({ length: 255 }).notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        data: date({ mode: 'string' }).notNull(),
        tipo: text().notNull(),
        recorrente: smallint().default(1).notNull(),
        estado: varchar({ length: 2 }),
        cidade: varchar({ length: 100 }),
        ativo: smallint().default(1).notNull(),
        criadoPor: varchar({ length: 255 }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("fer_company").on(table.companyId),
        index("fer_data").on(table.data),
        index("fer_tipo").on(table.tipo),
]);

export const folhaItens = pgTable("folha_itens", {
        id: serial().notNull(),
        folhaLancamentoId: integer().notNull(),
        companyId: integer().notNull(),
        employeeId: integer(),
        codigoContabil: varchar({ length: 20 }),
        nomeColaborador: varchar({ length: 255 }).notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataAdmissao: date({ mode: 'string' }),
        salarioBase: varchar({ length: 20 }),
        horasMensais: varchar({ length: 10 }),
        funcao: varchar({ length: 100 }),
        sf: integer().default(0),
        ir: integer().default(0),
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
        matchStatus: text().default('unmatched').notNull(),
        divergencias: json(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("folha_itens_lanc").on(table.folhaLancamentoId),
        index("folha_itens_emp").on(table.employeeId),
]);

export const folhaLancamentos = pgTable("folha_lancamentos", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        mesReferencia: varchar({ length: 7 }).notNull(),
        tipoLancamento: text().notNull(),
        status: text().default('importado').notNull(),
        analiticoUploadId: integer(),
        sinteticoUploadId: integer(),
        totalFuncionarios: integer().default(0),
        totalProventos: varchar({ length: 20 }),
        totalDescontos: varchar({ length: 20 }),
        totalLiquido: varchar({ length: 20 }),
        totalDivergencias: integer().default(0),
        divergenciasResolvidas: integer().default(0),
        importadoPor: varchar({ length: 255 }),
        importadoEm: timestamp({ mode: 'string' }),
        validadoPor: varchar({ length: 255 }),
        validadoEm: timestamp({ mode: 'string' }),
        consolidadoPor: varchar({ length: 255 }),
        consolidadoEm: timestamp({ mode: 'string' }),
        observacoes: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("folha_lanc_company_mes").on(table.companyId, table.mesReferencia),
]);

export const fornecedoresEpi = pgTable("fornecedores_epi", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        nome: varchar({ length: 255 }).notNull(),
        cnpj: varchar({ length: 20 }),
        contato: varchar({ length: 255 }),
        telefone: varchar({ length: 30 }),
        email: varchar({ length: 255 }),
        endereco: varchar({ length: 500 }),
        observacoes: text(),
        ativo: smallint().default(1).notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const goldenRules = pgTable("golden_rules", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        titulo: varchar({ length: 200 }).notNull(),
        descricao: text().notNull(),
        categoria: text().default('geral').notNull(),
        prioridade: text().default('alta').notNull(),
        isActive: smallint().default(1).notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        deletedAt: timestamp({ mode: 'string' }),
        deletedBy: varchar({ length: 255 }),
        deletedByUserId: integer(),
});

export const heSolicitacaoFuncionarios = pgTable("he_solicitacao_funcionarios", {
        id: serial().notNull(),
        solicitacaoId: integer().notNull(),
        employeeId: integer().notNull(),
        horasRealizadas: varchar({ length: 10 }),
        status: text().default('pendente').notNull(),
        observacao: text(),
},
(table) => [
        index("he_sol_func_sol").on(table.solicitacaoId),
        index("he_sol_func_emp").on(table.employeeId),
]);

export const heSolicitacoes = pgTable("he_solicitacoes", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        obraId: integer(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataSolicitacao: date({ mode: 'string' }).notNull(),
        horaInicio: varchar({ length: 10 }),
        horaFim: varchar({ length: 10 }),
        motivo: text().notNull(),
        status: text().default('pendente').notNull(),
        solicitadoPor: varchar({ length: 255 }).notNull(),
        solicitadoPorId: integer().notNull(),
        aprovadoPor: varchar({ length: 255 }),
        aprovadoPorId: integer(),
        aprovadoEm: timestamp({ mode: 'string' }),
        motivoRejeicao: text(),
        observacaoAdmin: text(),
        observacoes: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("he_sol_company").on(table.companyId),
        index("he_sol_obra").on(table.obraId),
        index("he_sol_data").on(table.dataSolicitacao),
        index("he_sol_status").on(table.status),
        index("he_sol_company_status").on(table.companyId, table.status),
]);

export const hydrants = pgTable("hydrants", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        numero: varchar({ length: 20 }).notNull(),
        localizacao: varchar({ length: 255 }),
        tipoHidrante: varchar({ length: 50 }),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        ultimaInspecao: date({ mode: 'string' }),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        proximaInspecao: date({ mode: 'string' }),
        statusHidrante: text().default('OK').notNull(),
        observacoes: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const insuranceAlertConfig = pgTable("insurance_alert_config", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        isActive: smallint().default(1).notNull(),
        textoAdmissao: text(),
        textoAfastamento: text(),
        textoReclusao: text(),
        textoDesligamento: text(),
        seguradora: varchar({ length: 255 }),
        apolice: varchar({ length: 100 }),
        observacoes: text(),
        criadoPor: varchar({ length: 255 }),
        atualizadoPor: varchar({ length: 255 }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("iac_company").on(table.companyId),
]);

export const insuranceAlertRecipients = pgTable("insurance_alert_recipients", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        configId: integer().notNull(),
        tipoDestinatario: text().notNull(),
        nome: varchar({ length: 255 }).notNull(),
        email: varchar({ length: 320 }).notNull(),
        telefone: varchar({ length: 20 }),
        cargo: varchar({ length: 100 }),
        recebeAdmissao: smallint().default(1).notNull(),
        recebeAfastamento: smallint().default(1).notNull(),
        recebeReclusao: smallint().default(1).notNull(),
        recebeDesligamento: smallint().default(1).notNull(),
        isActive: smallint().default(1).notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("iar_company").on(table.companyId),
        index("iar_config").on(table.configId),
]);

export const insuranceAlertsLog = pgTable("insurance_alerts_log", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        tipoMovimentacao: text().notNull(),
        statusAnterior: varchar({ length: 50 }),
        statusNovo: varchar({ length: 50 }),
        textoAlerta: text().notNull(),
        nomeFuncionario: varchar({ length: 255 }).notNull(),
        cpfFuncionario: varchar({ length: 14 }),
        funcaoFuncionario: varchar({ length: 100 }),
        obraFuncionario: varchar({ length: 255 }),
        destinatarios: json(),
        disparadoPor: varchar({ length: 255 }),
        disparoAutomatico: smallint().default(1).notNull(),
        statusEnvio: text().default('pendente').notNull(),
        erroMensagem: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("ial_company").on(table.companyId),
        index("ial_employee").on(table.employeeId),
        index("ial_tipo").on(table.companyId, table.tipoMovimentacao),
        index("ial_data").on(table.companyId, table.createdAt),
]);

export const jobFunctions = pgTable("job_functions", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        nome: varchar({ length: 100 }).notNull(),
        descricao: text(),
        ordemServico: text(),
        cbo: varchar({ length: 10 }),
        isActive: smallint().default(1).notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        deletedAt: timestamp({ mode: 'string' }),
        deletedBy: varchar({ length: 255 }),
        deletedByUserId: integer(),
});

export const manualObraAssignments = pgTable("manual_obra_assignments", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        obraId: integer().notNull(),
        mesReferencia: varchar({ length: 7 }).notNull(),
        justificativa: text().notNull(),
        percentual: integer().default(100).notNull(),
        atribuidoPor: varchar({ length: 255 }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("moa_company_mes").on(table.companyId, table.mesReferencia),
        index("moa_employee_mes").on(table.employeeId, table.mesReferencia),
]);

export const mealBenefitConfigs = pgTable("meal_benefit_configs", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        obraId: integer(),
        nome: varchar({ length: 255 }).default('Padrão').notNull(),
        cafeManhaDia: varchar({ length: 20 }).default('0'),
        lancheTardeDia: varchar({ length: 20 }).default('0'),
        valeAlimentacaoMes: varchar({ length: 20 }).default('0'),
        jantaDia: varchar({ length: 20 }).default('0'),
        totalVaIFood: varchar("totalVA_iFood", { length: 20 }).default('0'),
        diasUteisRef: integer().default(22),
        observacoes: text(),
        ativo: smallint().default(1),
        createdAt: timestamp({ mode: 'string' }).defaultNow(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow(),
        cafeAtivo: smallint().default(1),
        lancheAtivo: smallint().default(1),
        jantaAtivo: smallint().default(0),
},
(table) => [
        index("idx_meal_company").on(table.companyId),
        index("idx_meal_obra").on(table.obraId),
]);

export const menuConfig = pgTable("menu_config", {
        id: serial().notNull(),
        userId: integer().notNull(),
        configJson: text().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("mc_user").on(table.userId),
]);

export const menuLabels = pgTable("menu_labels", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        originalLabel: varchar({ length: 255 }).notNull(),
        customLabel: varchar({ length: 255 }).notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("ml_company_label").on(table.companyId, table.originalLabel),
        index("ml_company").on(table.companyId),
]);

export const monthlyPayrollSummary = pgTable("monthly_payroll_summary", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
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
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const notificationLogs = pgTable("notification_logs", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer(),
        employeeName: varchar({ length: 255 }).notNull(),
        employeeCpf: varchar({ length: 20 }),
        employeeFuncao: varchar({ length: 100 }),
        tipoMovimentacao: text().notNull(),
        statusAnterior: varchar({ length: 50 }),
        statusNovo: varchar({ length: 50 }),
        recipientId: integer(),
        recipientName: varchar({ length: 255 }).notNull(),
        recipientEmail: varchar({ length: 255 }).notNull(),
        titulo: varchar({ length: 500 }).notNull(),
        corpo: text(),
        statusEnvio: text().default('pendente').notNull(),
        erroMensagem: text(),
        trackingId: varchar({ length: 64 }),
        lido: smallint().default(0).notNull(),
        lidoEm: timestamp({ mode: 'string' }),
        disparadoPor: varchar({ length: 255 }),
        disparadoPorId: integer(),
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

export const notificationRecipients = pgTable("notification_recipients", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        nome: varchar({ length: 255 }).notNull(),
        email: varchar({ length: 255 }).notNull(),
        notificarContratacao: smallint().default(1).notNull(),
        notificarDemissao: smallint().default(1).notNull(),
        notificarTransferencia: smallint().default(0).notNull(),
        notificarAfastamento: smallint().default(0).notNull(),
        ativo: smallint().default(1).notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("nr_company").on(table.companyId),
        index("nr_email").on(table.email),
]);

export const obraFuncionarios = pgTable("obra_funcionarios", {
        id: serial().notNull(),
        obraId: integer().notNull(),
        employeeId: integer().notNull(),
        companyId: integer().notNull(),
        funcaoNaObra: varchar({ length: 100 }),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataInicio: date({ mode: 'string' }),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataFim: date({ mode: 'string' }),
        isActive: smallint().default(1).notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const obraHorasRateio = pgTable("obra_horas_rateio", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        obraId: integer().notNull(),
        employeeId: integer().notNull(),
        dixiDeviceId: integer(),
        mesAno: varchar({ length: 7 }).notNull(),
        horasNormais: varchar({ length: 10 }),
        horasExtras: varchar({ length: 10 }),
        horasNoturnas: varchar({ length: 10 }),
        totalHoras: varchar({ length: 10 }),
        diasTrabalhados: integer(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const obraPontoInconsistencies = pgTable("obra_ponto_inconsistencies", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        obraAlocadaId: integer(),
        obraPontoId: integer().notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataPonto: date({ mode: 'string' }).notNull(),
        snRelogio: varchar({ length: 50 }),
        status: text().default('pendente').notNull(),
        resolvidoPor: varchar({ length: 255 }),
        resolvidoPorUserId: integer(),
        resolvidoEm: timestamp({ mode: 'string' }),
        observacoes: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("opi_company").on(table.companyId),
        index("opi_employee").on(table.employeeId),
        index("opi_status").on(table.status),
        index("opi_data").on(table.dataPonto),
]);

export const obraSns = pgTable("obra_sns", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        obraId: integer(),
        sn: varchar({ length: 50 }).notNull(),
        apelido: varchar({ length: 100 }),
        status: text().default('ativo').notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataVinculo: date({ mode: 'string' }),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataLiberacao: date({ mode: 'string' }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("obra_sn_company").on(table.companyId),
        index("obra_sn_obra").on(table.obraId),
        index("obra_sn_sn").on(table.sn),
]);

export const obras = pgTable("obras", {
        id: serial().notNull(),
        companyId: integer().notNull(),
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
        status: text().default('Planejamento').notNull(),
        valorContrato: varchar({ length: 20 }),
        observacoes: text(),
        isActive: smallint().default(1).notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        numOrcamento: varchar({ length: 50 }),
        snRelogioPonto: varchar({ length: 50 }),
        deletedAt: timestamp({ mode: 'string' }),
        deletedBy: varchar({ length: 255 }),
        deletedByUserId: integer(),
        usarConvencaoMatriz: smallint().default(1).notNull(),
        convencaoId: integer(),
        convencaoDivergencias: text("convencao_divergencias"),
},
(table) => [
        index("idx_obra_company").on(table.companyId),
        index("idx_obra_status").on(table.companyId, table.status),
]);

export const payroll = pgTable("payroll", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        mesReferencia: varchar({ length: 7 }).notNull(),
        tipoFolha: text().notNull(),
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
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const payrollUploads = pgTable("payroll_uploads", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        category: text().notNull(),
        month: varchar({ length: 7 }).notNull(),
        fileName: varchar({ length: 255 }).notNull(),
        fileUrl: text().notNull(),
        fileKey: varchar({ length: 500 }).notNull(),
        fileSize: integer(),
        mimeType: varchar({ length: 100 }),
        uploadStatus: text().default('pendente').notNull(),
        recordsProcessed: integer().default(0),
        errorMessage: text(),
        uploadedBy: integer(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const permissions = pgTable("permissions", {
        id: serial().notNull(),
        profileId: integer().notNull(),
        module: varchar({ length: 50 }).notNull(),
        canView: smallint().default(0).notNull(),
        canCreate: smallint().default(0).notNull(),
        canEdit: smallint().default(0).notNull(),
        canDelete: smallint().default(0).notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const pjContracts = pgTable("pj_contracts", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        numeroContrato: varchar({ length: 50 }),
        cnpjPrestador: varchar({ length: 20 }),
        razaoSocialPrestador: varchar({ length: 255 }),
        objetoContrato: text(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataInicio: date({ mode: 'string' }).notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataFim: date({ mode: 'string' }).notNull(),
        renovacaoAutomatica: smallint().default(0),
        valorMensal: varchar({ length: 20 }),
        percentualAdiantamento: integer().default(40),
        percentualFechamento: integer().default(60),
        diaAdiantamento: integer().default(15),
        diaFechamento: integer().default(5),
        modeloContratoUrl: text(),
        contratoAssinadoUrl: text(),
        tipoAssinatura: text().default('pendente'),
        status: text().default('pendente_assinatura').notNull(),
        alertaVencimentoEnviado: smallint().default(0),
        contratoAnteriorId: integer(),
        observacoes: text(),
        criadoPor: varchar({ length: 255 }),
        criadoPorUserId: integer(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        deletedAt: timestamp({ mode: 'string' }),
        deletedBy: varchar({ length: 255 }),
        deletedByUserId: integer(),
},
(table) => [
        index("pjc_company").on(table.companyId),
        index("pjc_employee").on(table.employeeId),
        index("pjc_status").on(table.status),
        index("pjc_vencimento").on(table.dataFim),
]);

export const pjMedicoes = pgTable("pj_medicoes", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        contractId: integer().notNull(),
        employeeId: integer().notNull(),
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
        status: text().default('rascunho').notNull(),
        aprovadoPor: varchar({ length: 255 }),
        aprovadoEm: timestamp({ mode: 'string' }),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataPagamento: date({ mode: 'string' }),
        comprovanteUrl: text(),
        observacoes: text(),
        criadoPor: varchar({ length: 255 }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("pjm_company_mes").on(table.companyId, table.mesReferencia),
        index("pjm_contract").on(table.contractId),
        index("pjm_employee").on(table.employeeId),
        index("pjm_status").on(table.status),
]);

export const pjPayments = pgTable("pj_payments", {
        id: serial().notNull(),
        contractId: integer().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        mesReferencia: varchar({ length: 7 }).notNull(),
        tipo: text().notNull(),
        valor: varchar({ length: 20 }).notNull(),
        descricao: text(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataPagamento: date({ mode: 'string' }),
        status: text().default('pendente').notNull(),
        comprovanteUrl: text(),
        observacoes: text(),
        criadoPor: varchar({ length: 255 }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("pjp_contract").on(table.contractId),
        index("pjp_company_mes").on(table.companyId, table.mesReferencia),
        index("pjp_employee").on(table.employeeId),
]);

export const pontoConsolidacao = pgTable("ponto_consolidacao", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        mesReferencia: varchar({ length: 7 }).notNull(),
        status: text().default('aberto').notNull(),
        consolidadoPor: varchar({ length: 255 }),
        consolidadoEm: timestamp({ mode: 'string' }),
        desconsolidadoPor: varchar({ length: 255 }),
        desconsolidadoEm: timestamp({ mode: 'string' }),
        observacoes: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("ponto_consolidacao_company_mes").on(table.companyId, table.mesReferencia),
]);

export const pontoDescontos = pgTable("ponto_descontos", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        mesReferencia: varchar({ length: 7 }).notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        data: date({ mode: 'string' }).notNull(),
        tipo: text().notNull(),
        minutosAtraso: integer().default(0),
        minutosHe: integer().default(0),
        valorDesconto: varchar({ length: 20 }).default('0'),
        valorDsr: varchar({ length: 20 }).default('0'),
        valorTotal: varchar({ length: 20 }).default('0'),
        baseCalculo: text(),
        timeRecordId: integer(),
        heSolicitacaoId: integer(),
        status: text().default('calculado').notNull(),
        abonadoPor: varchar({ length: 255 }),
        abonadoEm: timestamp({ mode: 'string' }),
        motivoAbono: text(),
        fundamentacaoLegal: varchar({ length: 255 }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("pd_company_mes").on(table.companyId, table.mesReferencia),
        index("pd_employee_mes").on(table.employeeId, table.mesReferencia),
        index("pd_tipo").on(table.tipo),
        index("pd_status").on(table.status),
        index("pd_data").on(table.data),
]);

export const pontoDescontosResumo = pgTable("ponto_descontos_resumo", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        mesReferencia: varchar({ length: 7 }).notNull(),
        totalAtrasos: integer().default(0),
        totalMinutosAtraso: integer().default(0),
        totalFaltasInjustificadas: integer().default(0),
        totalSaidasAntecipadas: integer().default(0),
        totalMinutosSaidaAntecipada: integer().default(0),
        totalDsrPerdidos: integer().default(0),
        totalFeriadosPerdidos: integer().default(0),
        totalHeNaoAutorizadas: integer().default(0),
        totalMinutosHeNaoAutorizada: integer().default(0),
        valorTotalAtrasos: varchar({ length: 20 }).default('0'),
        valorTotalFaltas: varchar({ length: 20 }).default('0'),
        valorTotalDsr: varchar({ length: 20 }).default('0'),
        valorTotalFeriados: varchar({ length: 20 }).default('0'),
        valorTotalSaidasAntecipadas: varchar({ length: 20 }).default('0'),
        valorTotalHeNaoAutorizada: varchar({ length: 20 }).default('0'),
        valorTotalDescontos: varchar({ length: 20 }).default('0'),
        faltasAcumuladasPeriodoAquisitivo: integer().default(0),
        diasFeriasResultante: integer().default(30),
        status: text().default('calculado').notNull(),
        revisadoPor: varchar({ length: 255 }),
        revisadoEm: timestamp({ mode: 'string' }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("pdr_company_mes").on(table.companyId, table.mesReferencia),
        index("pdr_employee_mes").on(table.employeeId, table.mesReferencia),
]);

export const processoAnalises = pgTable("processo_analises", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        processoId: integer().notNull(),
        resumoExecutivo: text(),
        valorEstimadoRisco: numeric({ precision: 15, scale: 2 }),
        valorEstimadoAcordo: numeric({ precision: 15, scale: 2 }),
        probabilidadeCondenacao: integer(),
        probabilidadeAcordo: integer(),
        probabilidadeArquivamento: integer(),
        pontosFortes: json(),
        pontosFracos: json(),
        caminhosPositivos: json(),
        jurisprudenciaRelevante: json(),
        recomendacaoEstrategica: text(),
        insightsAdicionais: json(),
        valorCausaExtraido: numeric({ precision: 15, scale: 2 }),
        pedidosExtraidos: json(),
        modeloIa: varchar({ length: 100 }),
        promptUsado: text(),
        respostaCompleta: text(),
        tempoAnaliseMs: integer(),
        versaoAnalise: integer().default(1),
        criadoPor: varchar({ length: 255 }),
        criadoPorUserId: integer(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("pa_company").on(table.companyId),
        index("pa_processo").on(table.processoId),
]);

export const processoAprendizado = pgTable("processo_aprendizado", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        tipoProcesso: varchar({ length: 100 }),
        assuntos: json(),
        pedidos: json(),
        riscoInicial: varchar({ length: 20 }),
        valorCausa: numeric({ precision: 15, scale: 2 }),
        resultadoFinal: text(),
        valorFinalCondenacao: numeric({ precision: 15, scale: 2 }),
        valorFinalAcordo: numeric({ precision: 15, scale: 2 }),
        duracaoMeses: integer(),
        estrategiaAdotada: text(),
        resultadoEstrategia: text(),
        licaoAprendida: text(),
        processoId: integer(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("papr_company").on(table.companyId),
        index("papr_tipo").on(table.tipoProcesso),
        index("papr_resultado").on(table.resultadoFinal),
]);

export const processoDocumentos = pgTable("processo_documentos", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        processoId: integer().notNull(),
        nome: varchar({ length: 255 }).notNull(),
        tipo: text().default('outros').notNull(),
        descricao: text(),
        fileKey: varchar({ length: 500 }).notNull(),
        fileUrl: varchar({ length: 1000 }).notNull(),
        mimeType: varchar({ length: 100 }),
        tamanhoBytes: integer(),
        criadoPor: varchar({ length: 255 }),
        criadoPorUserId: integer(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        deletedAt: timestamp({ mode: 'string' }),
},
(table) => [
        index("pd_company").on(table.companyId),
        index("pd_processo").on(table.processoId),
]);

export const processosAndamentos = pgTable("processos_andamentos", {
        id: serial().notNull(),
        processoId: integer().notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        data: date({ mode: 'string' }).notNull(),
        tipo: text().default('outros').notNull(),
        descricao: text().notNull(),
        resultado: varchar({ length: 255 }),
        documentoUrl: varchar({ length: 500 }),
        documentoNome: varchar({ length: 255 }),
        criadoPor: varchar({ length: 255 }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("pal_processo").on(table.processoId),
        index("pal_data").on(table.processoId, table.data),
]);

export const processosTrabalhistas = pgTable("processos_trabalhistas", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        numeroProcesso: varchar({ length: 50 }).notNull(),
        vara: varchar({ length: 100 }),
        comarca: varchar({ length: 100 }),
        tribunal: varchar({ length: 100 }),
        tipoAcao: text().default('reclamatoria').notNull(),
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
        status: text().default('em_andamento').notNull(),
        fase: text().default('conhecimento').notNull(),
        risco: text().default('medio').notNull(),
        pedidos: json(),
        observacoes: text(),
        criadoPor: varchar({ length: 255 }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        clienteCnpj: varchar({ length: 20 }),
        clienteRazaoSocial: varchar({ length: 255 }),
        clienteNomeFantasia: varchar({ length: 255 }),
        deletedAt: timestamp({ mode: 'string' }),
        deletedBy: varchar({ length: 255 }),
        deletedByUserId: integer(),
        justica: text().default('trabalho').notNull(),
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
        datajudTotalMovimentos: integer(),
        datajudAutoDetectado: smallint().default(0).notNull(),
},
(table) => [
        index("pt_company").on(table.companyId),
        index("pt_employee").on(table.employeeId),
        index("pt_status").on(table.companyId, table.status),
        index("pt_numero").on(table.numeroProcesso),
]);

export const risks = pgTable("risks", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        setor: varchar({ length: 100 }).notNull(),
        agenteRisco: varchar({ length: 255 }).notNull(),
        tipoRisco: text().notNull(),
        fonteGeradora: varchar({ length: 255 }),
        grauRisco: text().notNull(),
        medidasControle: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const sectors = pgTable("sectors", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        nome: varchar({ length: 100 }).notNull(),
        descricao: varchar({ length: 255 }),
        isActive: smallint().default(1).notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        deletedAt: timestamp({ mode: 'string' }),
        deletedBy: varchar({ length: 255 }),
        deletedByUserId: integer(),
});

export const systemCriteria = pgTable("system_criteria", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        categoria: varchar({ length: 50 }).notNull(),
        chave: varchar({ length: 100 }).notNull(),
        valor: varchar({ length: 255 }).notNull(),
        descricao: varchar({ length: 500 }),
        valorPadraoClt: varchar({ length: 255 }),
        unidade: varchar({ length: 50 }),
        atualizadoPor: varchar({ length: 255 }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("sys_criteria_company_cat").on(table.companyId, table.categoria),
        index("sys_criteria_company_key").on(table.companyId, table.chave),
]);

export const systemRevisions = pgTable("system_revisions", {
        id: serial().notNull(),
        version: integer().notNull(),
        titulo: varchar({ length: 255 }).notNull(),
        descricao: text().notNull(),
        tipo: text().notNull(),
        modulos: text(),
        criadoPor: varchar({ length: 255 }).notNull(),
        dataPublicacao: timestamp({ mode: 'string' }).defaultNow().notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("sr_version").on(table.version),
]);

export const terminationNotices = pgTable("termination_notices", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        tipo: text().notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataInicio: date({ mode: 'string' }).notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataFim: date({ mode: 'string' }).notNull(),
        diasAviso: integer().default(30).notNull(),
        anosServico: integer().default(0),
        reducaoJornada: text().default('nenhuma'),
        salarioBase: varchar({ length: 20 }),
        previsaoRescisao: text(),
        valorEstimadoTotal: varchar({ length: 20 }),
        status: text().default('em_andamento').notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataConclusao: date({ mode: 'string' }),
        motivoCancelamento: text(),
        observacoes: text(),
        criadoPor: varchar({ length: 255 }),
        criadoPorUserId: integer(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        deletedAt: timestamp({ mode: 'string' }),
        deletedBy: varchar({ length: 255 }),
        deletedByUserId: integer(),
        revertidoManualmente: smallint().default(0),
},
(table) => [
        index("tn_company").on(table.companyId),
        index("tn_employee").on(table.employeeId),
        index("tn_status").on(table.status),
]);

export const timeInconsistencies = pgTable("time_inconsistencies", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        obraId: integer(),
        timeRecordId: integer(),
        mesReferencia: varchar({ length: 7 }).notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        data: date({ mode: 'string' }).notNull(),
        tipoInconsistencia: text().notNull(),
        descricao: text(),
        status: text().default('pendente').notNull(),
        justificativa: text(),
        resolvidoPor: varchar({ length: 255 }),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        resolvidoEm: date({ mode: 'string' }),
        warningId: integer(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("time_incons_emp_mes").on(table.employeeId, table.mesReferencia),
]);

export const timeRecords = pgTable("time_records", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
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
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        obraId: integer(),
        mesReferencia: varchar({ length: 7 }),
        ajusteManual: smallint().default(0),
        ajustadoPor: varchar({ length: 255 }),
        batidasBrutas: json(),
});

export const trainingDocuments = pgTable("training_documents", {
        id: serial().notNull(),
        trainingId: integer().notNull(),
        employeeId: integer().notNull(),
        companyId: integer().notNull(),
        fileName: varchar({ length: 255 }).notNull(),
        fileUrl: text().notNull(),
        fileKey: varchar({ length: 500 }).notNull(),
        fileSize: integer(),
        mimeType: varchar({ length: 100 }),
        description: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const trainings = pgTable("trainings", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
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
        statusTreinamento: text().default('Valido').notNull(),
        observacoes: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        deletedAt: timestamp({ mode: 'string' }),
        deletedBy: varchar({ length: 255 }),
        deletedByUserId: integer(),
});

export const unmatchedDixiRecords = pgTable("unmatched_dixi_records", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        obraId: integer(),
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
        status: text().default('pendente').notNull(),
        linkedEmployeeId: integer(),
        resolvidoPor: varchar({ length: 255 }),
        resolvidoEm: timestamp({ mode: 'string' }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("udr_company_mes").on(table.companyId, table.mesReferencia),
        index("udr_status").on(table.status),
        index("udr_dixi_name").on(table.dixiName),
]);

export const userCompanies = pgTable("user_companies", {
        id: serial().notNull(),
        userId: integer().notNull(),
        companyId: integer().notNull(),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("uk_user_company").on(table.userId, table.companyId),
]);

export const userPermissions = pgTable("user_permissions", {
        id: serial().notNull(),
        userId: integer().notNull(),
        moduleId: varchar("module_id", { length: 50 }).notNull(),
        featureKey: varchar("feature_key", { length: 100 }).notNull(),
        canAccess: smallint().default(1).notNull(),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("up_user").on(table.userId),
        index("up_module").on(table.moduleId),
        index("up_user_module").on(table.userId, table.moduleId),
]);

export const userProfiles = pgTable("user_profiles", {
        id: serial().notNull(),
        userId: integer().notNull(),
        companyId: integer().notNull(),
        profileType: text().notNull(),
        isActive: smallint().default(1).notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const users = pgTable("users", {
        id: serial().notNull(),
        openId: varchar({ length: 64 }).notNull(),
        name: text(),
        email: varchar({ length: 320 }),
        loginMethod: varchar({ length: 64 }),
        role: text().default('user').notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        lastSignedIn: timestamp({ mode: 'string' }).defaultNow().notNull(),
        username: varchar({ length: 100 }),
        password: varchar({ length: 255 }),
        mustChangePassword: smallint().default(1),
        avatarUrl: text(),
        deletedAt: timestamp({ mode: 'string' }),
        deletedBy: varchar({ length: 255 }),
        deletedByUserId: integer(),
        modulesAccess: text(),
},
(table) => [
        index("users_openId_unique").on(table.openId),
]);

export const vacationPeriods = pgTable("vacation_periods", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
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
        diasGozo: integer().default(30),
        fracionamento: integer().default(1),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        periodo2Inicio: date({ mode: 'string' }),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        periodo2Fim: date({ mode: 'string' }),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        periodo3Inicio: date({ mode: 'string' }),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        periodo3Fim: date({ mode: 'string' }),
        abonoPecuniario: smallint().default(0),
        valorFerias: varchar({ length: 20 }),
        valorTercoConstitucional: varchar({ length: 20 }),
        valorAbono: varchar({ length: 20 }),
        valorTotal: varchar({ length: 20 }),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataPagamento: date({ mode: 'string' }),
        status: text().default('pendente').notNull(),
        vencida: smallint().default(0),
        pagamentoEmDobro: smallint().default(0),
        observacoes: text(),
        aprovadoPor: varchar({ length: 255 }),
        aprovadoPorUserId: integer(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        deletedAt: timestamp({ mode: 'string' }),
        deletedBy: varchar({ length: 255 }),
        deletedByUserId: integer(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataSugeridaInicio: date({ mode: 'string' }),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataSugeridaFim: date({ mode: 'string' }),
        dataAlteradaPeloRh: smallint().default(0),
        numeroPeriodo: integer().default(1),
},
(table) => [
        index("vp_company").on(table.companyId),
        index("vp_employee").on(table.employeeId),
        index("vp_status").on(table.status),
        index("vp_concessivo").on(table.periodoConcessivoFim),
]);

export const vehicles = pgTable("vehicles", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        tipoVeiculo: text().notNull(),
        placa: varchar({ length: 10 }),
        modelo: varchar({ length: 100 }).notNull(),
        marca: varchar({ length: 100 }),
        anoFabricacao: varchar({ length: 4 }),
        renavam: varchar({ length: 20 }),
        chassi: varchar({ length: 30 }),
        responsavel: varchar({ length: 255 }),
        statusVeiculo: text().default('Ativo').notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        proximaManutencao: date({ mode: 'string' }),
        observacoes: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const vrBenefits = pgTable("vr_benefits", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        mesReferencia: varchar({ length: 7 }).notNull(),
        valorDiario: varchar({ length: 20 }),
        diasUteis: integer(),
        valorTotal: varchar({ length: 20 }).notNull(),
        operadora: varchar({ length: 100 }).default('iFood Benefícios'),
        observacoes: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        valorCafe: varchar({ length: 20 }).default('0'),
        valorLanche: varchar({ length: 20 }).default('0'),
        valorJanta: varchar({ length: 20 }).default('0'),
        valorVa: varchar({ length: 20 }).default('0'),
        status: text().default('pendente').notNull(),
        motivoAlteracao: text(),
        geradoPor: varchar({ length: 255 }),
        aprovadoPor: varchar({ length: 255 }),
},
(table) => [
        index("vr_company_mes").on(table.companyId, table.mesReferencia),
        index("vr_employee").on(table.employeeId),
]);

export const warningTemplates = pgTable("warning_templates", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        tipo: text().notNull(),
        titulo: varchar({ length: 255 }).notNull(),
        textoModelo: text().notNull(),
        baseJuridica: text(),
        isDefault: smallint().default(0).notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const warnings = pgTable("warnings", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        tipoAdvertencia: text().notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataOcorrencia: date({ mode: 'string' }).notNull(),
        motivo: text().notNull(),
        descricao: text(),
        testemunhas: text(),
        documentoUrl: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        numeroSequencial: integer().default(1),
        diasSupensao: integer(),
        sequencia: integer().default(1),
        aplicadoPor: varchar({ length: 255 }),
        diasSuspensao: integer(),
        origemModulo: varchar({ length: 50 }),
        origemId: integer(),
        deletedAt: timestamp({ mode: 'string' }),
        deletedBy: varchar({ length: 255 }),
        deletedByUserId: integer(),
});


// ============================================================
// MÓDULO TERCEIROS - Empresas Terceirizadas e Subcontratadas
// ============================================================

export const empresasTerceiras = pgTable("empresas_terceiras", {
  id: serial().primaryKey(),
  companyId: integer().notNull(),
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
  tipoConta: text(),
  titularConta: varchar("titular_conta", { length: 255 }),
  cpfCnpjTitular: varchar("cpf_cnpj_titular", { length: 20 }),
  // Forma de pagamento
  formaPagamento: text(),
  pixChave: varchar("pix_chave", { length: 255 }),
  pixTipoChave: text(),
  // Status
  status: text().default("ativa").notNull(),
  observacoes: text(),
  // Controle
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  createdBy: varchar("created_by", { length: 255 }),
  deletedAt: timestamp("deleted_at", { mode: "string" }),
});

export const funcionariosTerceiros = pgTable("funcionarios_terceiros", {
  id: serial().primaryKey(),
  empresaTerceiraId: integer().notNull(),
  companyId: integer().notNull(),
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
  obraId: integer(),
  obraNome: varchar("obra_nome", { length: 255 }),
  // Status de aptidão
  statusAptidao: text().default("pendente").notNull(),
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
  status: text().default("ativo").notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "string" }),
});

export const obrigacoesMensaisTerceiros = pgTable("obrigacoes_mensais_terceiros", {
  id: serial().primaryKey(),
  empresaTerceiraId: integer().notNull(),
  companyId: integer().notNull(),
  competencia: varchar({ length: 7 }).notNull(), // YYYY-MM
  // Documentos mensais
  fgtsUrl: varchar("fgts_url", { length: 500 }),
  fgtsStatus: text().default("pendente").notNull(),
  inssUrl: varchar("inss_url", { length: 500 }),
  inssStatus: text().default("pendente").notNull(),
  folhaPagamentoUrl: varchar("folha_pagamento_url", { length: 500 }),
  folhaPagamentoStatus: text().default("pendente").notNull(),
  comprovantePagamentoUrl: varchar("comprovante_pagamento_url", { length: 500 }),
  comprovantePagamentoStatus: text().default("pendente").notNull(),
  gpsUrl: varchar("gps_url", { length: 500 }),
  gpsStatus: text().default("pendente").notNull(),
  cndUrl: varchar("cnd_url", { length: 500 }),
  cndStatus: text().default("pendente").notNull(),
  // Status geral
  statusGeral: text().default("pendente").notNull(),
  observacoes: text(),
  validadoPor: varchar("validado_por", { length: 255 }),
  validadoEm: timestamp("validado_em", { mode: "string" }),
  // Controle
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
});

export const alertasTerceiros = pgTable("alertas_terceiros", {
  id: serial().primaryKey(),
  empresaTerceiraId: integer().notNull(),
  companyId: integer().notNull(),
  tipo: text().notNull(),
  titulo: varchar({ length: 255 }).notNull(),
  descricao: text(),
  dataVencimento: timestamp("data_vencimento", { mode: "string" }),
  emailEnviado: smallint().default(0),
  emailEnviadoEm: timestamp("email_enviado_em", { mode: "string" }),
  resolvido: smallint().default(0),
  resolvidoEm: timestamp("resolvido_em", { mode: "string" }),
  resolvidoPor: varchar("resolvido_por", { length: 255 }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
});

// ============================================================
// MÓDULO PARCEIROS - Portal de Parceiros Conveniados
// ============================================================

export const parceirosConveniados = pgTable("parceiros_conveniados", {
  id: serial().primaryKey(),
  companyId: integer().notNull(),
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
  tipoConvenio: text().notNull(),
  tipoConvenioOutro: varchar("tipo_convenio_outro", { length: 100 }),
  // Dados bancários
  banco: varchar("banco_parceiro", { length: 100 }),
  agencia: varchar("agencia_parceiro", { length: 20 }),
  conta: varchar("conta_parceiro", { length: 30 }),
  tipoConta: text(),
  titularConta: varchar("titular_conta_parceiro", { length: 255 }),
  cpfCnpjTitular: varchar("cpf_cnpj_titular_parceiro", { length: 20 }),
  // Forma de pagamento
  formaPagamento: text(),
  pixChave: varchar("pix_chave_parceiro", { length: 255 }),
  pixTipoChave: text(),
  // Condições do convênio
  diaFechamento: integer(),
  prazoPagamento: integer(),
  limiteMensalPorColaborador: numeric("limite_mensal_por_colaborador", { precision: 10, scale: 2 }),
  // Documentos
  contratoConvenioUrl: varchar("contrato_convenio_url", { length: 500 }),
  contratoSocialUrl: varchar("contrato_social_url_parceiro", { length: 500 }),
  alvaraUrl: varchar("alvara_url_parceiro", { length: 500 }),
  // Status
  status: text().default("ativo").notNull(),
  observacoes: text("observacoes_parceiro"),
  // Acesso externo
  loginEmail: varchar("login_email", { length: 255 }),
  loginSenhaHash: varchar("login_senha_hash", { length: 255 }),
  acessoExternoAtivo: smallint().default(0),
  // Controle
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  createdBy: varchar("created_by", { length: 255 }),
  deletedAt: timestamp("deleted_at", { mode: "string" }),
});

export const lancamentosParceiros = pgTable("lancamentos_parceiros", {
  id: serial().primaryKey(),
  parceiroId: integer().notNull(),
  companyId: integer().notNull(),
  employeeId: integer().notNull(),
  employeeNome: varchar("employee_nome", { length: 255 }).notNull(),
  // Dados do lançamento
  dataCompra: timestamp("data_compra", { mode: "string" }).notNull(),
  descricaoItens: text("descricao_itens"),
  valor: numeric({ precision: 10, scale: 2 }).notNull(),
  comprovanteUrl: varchar("comprovante_url", { length: 500 }),
  // Status
  status: text().default("pendente").notNull(),
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

export const pagamentosParceiros = pgTable("pagamentos_parceiros", {
  id: serial().primaryKey(),
  parceiroId: integer().notNull(),
  companyId: integer().notNull(),
  competencia: varchar("competencia_pagamento", { length: 7 }).notNull(), // YYYY-MM
  valorTotal: numeric("valor_total", { precision: 10, scale: 2 }).notNull(),
  status: text().default("pendente").notNull(),
  dataPagamento: timestamp("data_pagamento", { mode: "string" }),
  comprovanteUrl: varchar("comprovante_pagamento_url", { length: 500 }),
  observacoes: text("observacoes_pagamento"),
  pagoBy: varchar("pago_by", { length: 255 }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
});


// ========== CONFIGURAÇÃO DE MÓDULOS POR EMPRESA ==========
export const moduleConfig = pgTable("module_config", {
  id: serial().primaryKey(),
  companyId: integer().notNull(),
  moduleKey: varchar("module_key", { length: 50 }).notNull(), // rh, sst, juridico, avaliacao, terceiros, parceiros
  enabled: smallint().default(1).notNull(), // 1 = habilitado, 0 = desabilitado
  enabledAt: timestamp("enabled_at", { mode: "string" }).defaultNow(),
  disabledAt: timestamp("disabled_at", { mode: "string" }),
  updatedBy: varchar("updated_by", { length: 255 }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
}, (table) => [
  index("mc_company_module").on(table.companyId, table.moduleKey),
]);


// ========== PORTAL EXTERNO - CREDENCIAIS ==========
export const portalCredentials = pgTable("portal_credentials", {
  id: serial().primaryKey(),
  tipo: text().notNull(),
  empresaTerceiraId: integer(),
  parceiroId: integer(),
  companyId: integer().notNull(),
  cnpj: varchar({ length: 20 }).notNull(),
  senhaHash: varchar("senha_hash", { length: 255 }).notNull(),
  nomeEmpresa: varchar("nome_empresa", { length: 255 }),
  emailResponsavel: varchar("email_responsavel", { length: 255 }),
  nomeResponsavel: varchar("nome_responsavel", { length: 255 }),
  primeiroAcesso: smallint().default(1).notNull(),
  ativo: smallint().default(1).notNull(),
  ultimoLogin: timestamp("ultimo_login", { mode: "string" }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
}, (table) => [
  index("pc_cnpj").on(table.cnpj),
  index("pc_tipo_empresa").on(table.tipo, table.empresaTerceiraId),
  index("pc_tipo_parceiro").on(table.tipo, table.parceiroId),
]);


// ============================================================
// GRUPOS DE USUÁRIOS - Sistema de permissões por grupo
// ============================================================
export const userGroups = pgTable("user_groups", {
        id: serial().notNull(),
        nome: varchar({ length: 100 }).notNull(),
        descricao: varchar({ length: 255 }),
        cor: varchar({ length: 20 }).default('#6b7280'),
        icone: varchar({ length: 50 }).default('Users'),
        ativo: smallint().default(1).notNull(),
        somenteVisualizacao: smallint().default(1).notNull(),
        ocultarDadosSensiveis: smallint().default(1).notNull(),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("ug_nome").on(table.nome),
]);

export const userGroupPermissions = pgTable("user_group_permissions", {
        id: serial().notNull(),
        groupId: integer().notNull(),
        rota: varchar({ length: 200 }).notNull(),
        canView: smallint().default(1).notNull(),
        canEdit: smallint().default(0).notNull(),
        canCreate: smallint().default(0).notNull(),
        canDelete: smallint().default(0).notNull(),
        ocultarValores: smallint().default(0).notNull(),
        ocultarDocumentos: smallint().default(0).notNull(),
}, (table) => [
        index("ugp_group").on(table.groupId),
        index("ugp_group_rota").on(table.groupId, table.rota),
]);

export const userGroupMembers = pgTable("user_group_members", {
        id: serial().notNull(),
        groupId: integer().notNull(),
        userId: integer().notNull(),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("ugm_group").on(table.groupId),
        index("ugm_user").on(table.userId),
        index("ugm_group_user").on(table.groupId, table.userId),
]);


// ============================================================
// MÓDULO COMPLETO: PONTO E FOLHA DE PAGAMENTO (Rev. 167+)
// ============================================================

// Competências mensais - controla o ciclo de vida de cada mês
export const payrollPeriods = pgTable("payroll_periods", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        mesReferencia: varchar({ length: 7 }).notNull(),
        pontoInicio: date({ mode: 'string' }),
        pontoFim: date({ mode: 'string' }),
        escuroInicio: date({ mode: 'string' }),
        escuroFim: date({ mode: 'string' }),
        status: text().default('aberta').notNull(),
        pontoImportadoEm: timestamp({ mode: 'string' }),
        pontoImportadoPor: varchar({ length: 255 }),
        valeGeradoEm: timestamp({ mode: 'string' }),
        valeGeradoPor: varchar({ length: 255 }),
        pagamentoSimuladoEm: timestamp({ mode: 'string' }),
        pagamentoSimuladoPor: varchar({ length: 255 }),
        consolidadoEm: timestamp({ mode: 'string' }),
        consolidadoPor: varchar({ length: 255 }),
        travadoEm: timestamp({ mode: 'string' }),
        travadoPor: varchar({ length: 255 }),
        afericaoRealizada: smallint().default(0).notNull(),
        afericaoEm: timestamp({ mode: 'string' }),
        afericaoPor: varchar({ length: 255 }),
        totalDivergenciasAferidas: integer().default(0),
        retificadoEm: timestamp({ mode: 'string' }),
        retificadoPor: varchar({ length: 255 }),
        motivoRetificacao: text(),
        totalFuncionarios: integer().default(0),
        totalSalarioBruto: varchar({ length: 20 }).default('0'),
        totalVale: varchar({ length: 20 }).default('0'),
        totalHorasExtras: varchar({ length: 20 }).default('0'),
        totalDescontos: varchar({ length: 20 }).default('0'),
        totalLiquido: varchar({ length: 20 }).default('0'),
        observacoes: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("pp_company_mes").on(table.companyId, table.mesReferencia),
        index("pp_status").on(table.status),
]);

// Registro diário de ponto processado por funcionário
export const timecardDaily = pgTable("timecard_daily", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        data: date({ mode: 'string' }).notNull(),
        mesCompetencia: varchar({ length: 7 }).notNull(),
        statusDia: text().default('registrado').notNull(),
        entrada1: varchar({ length: 10 }),
        saida1: varchar({ length: 10 }),
        entrada2: varchar({ length: 10 }),
        saida2: varchar({ length: 10 }),
        entrada3: varchar({ length: 10 }),
        saida3: varchar({ length: 10 }),
        horasTrabalhadas: varchar({ length: 10 }),
        horasExtras: varchar({ length: 10 }),
        horasNoturnas: varchar({ length: 10 }),
        isFalta: smallint().default(0).notNull(),
        isAtraso: smallint().default(0).notNull(),
        isSaidaAntecipada: smallint().default(0).notNull(),
        minutosAtraso: integer().default(0),
        minutosSaidaAntecipada: integer().default(0),
        tipoDia: text().default('util').notNull(),
        timeRecordId: integer(),
        obraId: integer(),
        origemRegistro: varchar({ length: 20 }).default('dixi').notNull(),
        numBatidas: integer().default(0),
        isInconsistente: smallint().default(0).notNull(),
        inconsistenciaTipo: varchar({ length: 50 }),
        resolucaoTipo: varchar({ length: 50 }),
        resolucaoObs: text(),
        resolucaoEm: timestamp({ mode: 'string' }),
        resolucaoPor: varchar({ length: 255 }),
        atestadoId: integer(),
        advertenciaId: integer(),
        obraSecundariaId: integer(),
        rateioPercentual: integer(),
        statusAnterior: text(),
        afericaoResultado: text(),
        afericaoObs: text(),
        afericaoEm: timestamp({ mode: 'string' }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("td_company_emp_data").on(table.companyId, table.employeeId, table.data),
        index("td_company_mes").on(table.companyId, table.mesCompetencia),
        index("td_status").on(table.statusDia),
        index("td_employee_mes").on(table.employeeId, table.mesCompetencia),
]);

// Adiantamentos/Vales gerados automaticamente
export const payrollAdvances = pgTable("payroll_advances", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        mesReferencia: varchar({ length: 7 }).notNull(),
        periodId: integer(),
        salarioBrutoMes: varchar({ length: 20 }).notNull(),
        percentualAdiantamento: integer().default(40),
        valorAdiantamento: varchar({ length: 20 }).notNull(),
        valorHorasExtras: varchar({ length: 20 }).default('0'),
        horasExtrasQtd: varchar({ length: 10 }).default('0'),
        valorTotalVale: varchar({ length: 20 }).notNull(),
        bloqueado: smallint().default(0).notNull(),
        motivoBloqueio: varchar({ length: 255 }),
        faltasNoPeriodo: integer().default(0),
        valorHora: varchar({ length: 20 }),
        cargaHorariaDiaria: integer().default(8),
        diasUteisNoMes: integer(),
        status: text().default('calculado').notNull(),
        dataPagamento: date({ mode: 'string' }),
        aprovadoPor: varchar({ length: 255 }),
        aprovadoEm: timestamp({ mode: 'string' }),
        bancoDestino: varchar({ length: 100 }),
        observacoes: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("pa_company_mes").on(table.companyId, table.mesReferencia),
        index("pa_employee_mes").on(table.employeeId, table.mesReferencia),
        index("pa_period").on(table.periodId),
        index("pa_status").on(table.status),
]);

// Pagamentos/Salários consolidados
export const payrollPayments = pgTable("payroll_payments", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        mesReferencia: varchar({ length: 7 }).notNull(),
        periodId: integer(),
        valorHora: varchar({ length: 20 }),
        cargaHorariaDiaria: integer().default(8),
        diasUteisNoMes: integer(),
        salarioBrutoMes: varchar({ length: 20 }).notNull(),
        horasExtrasValor: varchar({ length: 20 }).default('0'),
        adicionaisValor: varchar({ length: 20 }).default('0'),
        adicionaisDetalhes: json(),
        totalProventos: varchar({ length: 20 }).notNull(),
        descontoAdiantamento: varchar({ length: 20 }).default('0'),
        descontoFaltas: varchar({ length: 20 }).default('0'),
        descontoFaltasQtd: integer().default(0),
        descontoAtrasos: varchar({ length: 20 }).default('0'),
        descontoAtrasosMinutos: integer().default(0),
        descontoVrFaltas: varchar({ length: 20 }).default('0'),
        descontoVtFaltas: varchar({ length: 20 }).default('0'),
        descontoPensao: varchar({ length: 20 }).default('0'),
        descontoInss: varchar({ length: 20 }).default('0'),
        descontoIrrf: varchar({ length: 20 }).default('0'),
        descontoFgts: varchar({ length: 20 }).default('0'),
        descontoEpi: varchar({ length: 20 }).default('0'),
        descontoOutros: varchar({ length: 20 }).default('0'),
        descontoOutrosDetalhes: json(),
        totalDescontos: varchar({ length: 20 }).notNull(),
        acertoEscuroValor: varchar({ length: 20 }).default('0'),
        acertoEscuroDetalhes: json(),
        salarioLiquido: varchar({ length: 20 }).notNull(),
        status: text().default('simulado').notNull(),
        dataPagamento: date({ mode: 'string' }),
        dataPagamentoPrevista: date({ mode: 'string' }),
        consolidadoPor: varchar({ length: 255 }),
        consolidadoEm: timestamp({ mode: 'string' }),
        bancoDestino: varchar({ length: 100 }),
        observacoes: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("ppay_company_mes").on(table.companyId, table.mesReferencia),
        index("ppay_employee_mes").on(table.employeeId, table.mesReferencia),
        index("ppay_period").on(table.periodId),
        index("ppay_status").on(table.status),
]);

// Acertos retroativos do período "no escuro"
export const payrollAdjustments = pgTable("payroll_adjustments", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        mesOrigem: varchar({ length: 7 }).notNull(),
        mesDesconto: varchar({ length: 7 }).notNull(),
        data: date({ mode: 'string' }).notNull(),
        tipo: text().notNull(),
        descricao: text(),
        valorDesconto: varchar({ length: 20 }).notNull(),
        valorVrDesconto: varchar({ length: 20 }).default('0'),
        valorVtDesconto: varchar({ length: 20 }).default('0'),
        valorTotal: varchar({ length: 20 }).notNull(),
        timecardDailyId: integer(),
        paymentId: integer(),
        status: text().default('pendente').notNull(),
        abonadoPor: varchar({ length: 255 }),
        abonadoEm: timestamp({ mode: 'string' }),
        motivoAbono: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("padj_company_origem").on(table.companyId, table.mesOrigem),
        index("padj_company_desconto").on(table.companyId, table.mesDesconto),
        index("padj_employee").on(table.employeeId),
        index("padj_status").on(table.status),
]);

// Eventos financeiros - ponte para módulo financeiro futuro
export const financialEvents = pgTable("financial_events", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        tipo: text().notNull(),
        categoria: varchar({ length: 50 }).default('folha_pagamento').notNull(),
        subcategoria: varchar({ length: 100 }),
        mesCompetencia: varchar({ length: 7 }).notNull(),
        dataPrevista: date({ mode: 'string' }).notNull(),
        dataEfetiva: date({ mode: 'string' }),
        valor: varchar({ length: 20 }).notNull(),
        status: text().default('previsto').notNull(),
        employeeId: integer(),
        employeeName: varchar({ length: 255 }),
        obraId: integer(),
        obraNome: varchar({ length: 255 }),
        descricao: text(),
        origemTipo: varchar({ length: 50 }),
        origemId: integer(),
        criadoPor: varchar({ length: 255 }),
        atualizadoPor: varchar({ length: 255 }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("fe_company_mes").on(table.companyId, table.mesCompetencia),
        index("fe_tipo").on(table.tipo),
        index("fe_status").on(table.status),
        index("fe_data_prevista").on(table.dataPrevista),
        index("fe_employee").on(table.employeeId),
        index("fe_obra").on(table.obraId),
]);

// Alertas de prazos da folha
export const payrollAlerts = pgTable("payroll_alerts", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        mesReferencia: varchar({ length: 7 }).notNull(),
        tipo: text().notNull(),
        titulo: varchar({ length: 255 }).notNull(),
        descricao: text(),
        prioridade: text().default('media').notNull(),
        lido: smallint().default(0).notNull(),
        lidoEm: timestamp({ mode: 'string' }),
        lidoPor: varchar({ length: 255 }),
        resolvido: smallint().default(0).notNull(),
        resolvidoEm: timestamp({ mode: 'string' }),
        resolvidoPor: varchar({ length: 255 }),
        employeeId: integer(),
        periodId: integer(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("pal_company_mes").on(table.companyId, table.mesReferencia),
        index("pal_tipo").on(table.tipo),
        index("pal_lido").on(table.lido),
]);

// ============================================================
// MÓDULO APONTAMENTOS DE CAMPO
// ============================================================
export const fieldNotes = pgTable("field_notes", {
        id: serial().primaryKey().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        obraId: integer(),
        data: date({ mode: 'string' }).notNull(),
        tipoOcorrencia: text().notNull(),
        descricao: text().notNull(),
        solicitanteNome: varchar({ length: 255 }).notNull(),
        solicitanteId: varchar({ length: 255 }),
        evidenciaUrl: varchar({ length: 500 }),
        prioridade: text().default('media').notNull(),
        status: text().default('pendente').notNull(),
        respostaRH: text(),
        acaoTomada: text(),
        resolvidoPor: varchar({ length: 255 }),
        resolvidoEm: timestamp({ mode: 'string' }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        deletedAt: timestamp({ mode: 'string' }),
}, (table) => [
        index("fn_company").on(table.companyId),
        index("fn_employee").on(table.employeeId),
        index("fn_obra").on(table.obraId),
        index("fn_status").on(table.status),
        index("fn_data").on(table.data),
        index("fn_tipo").on(table.tipoOcorrencia),
]);

// ========== CADASTRO DE MÉDICOS E CLÍNICAS (autocomplete ASO/Atestados) ==========

export const medicos = pgTable("medicos", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        nome: varchar({ length: 255 }).notNull(),
        crm: varchar({ length: 50 }).notNull(),
        especialidade: varchar({ length: 255 }),
        ativo: smallint().default(1).notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("med_company").on(table.companyId),
        index("med_crm").on(table.crm),
]);

export const clinicas = pgTable("clinicas", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        nome: varchar({ length: 255 }).notNull(),
        endereco: varchar({ length: 500 }),
        telefone: varchar({ length: 50 }),
        ativo: smallint().default(1).notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("clin_company").on(table.companyId),
]);

// ============================================================
// MÓDULO EPI AVANÇADO - Kits, Validade, Assinaturas, Treinamentos
// ============================================================

// Kits de EPI por Função (ex: Kit Pedreiro, Kit Eletricista)
export const epiKits = pgTable("epi_kits", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        nome: varchar({ length: 255 }).notNull(),
        funcao: varchar({ length: 100 }).notNull(),
        descricao: text(),
        ativo: smallint().default(1).notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("ek_company").on(table.companyId),
        index("ek_funcao").on(table.funcao),
]);

// Itens de cada Kit de EPI
export const epiKitItems = pgTable("epi_kit_items", {
        id: serial().notNull(),
        kitId: integer().notNull(),
        epiId: integer(),
        nomeEpi: varchar({ length: 255 }).notNull(),
        categoria: text().default('EPI').notNull(),
        quantidade: integer().default(1).notNull(),
        obrigatorio: smallint().default(1).notNull(),
        observacoes: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("eki_kit").on(table.kitId),
        index("eki_epi").on(table.epiId),
]);

// Cores de Capacete por Função
export const epiCoresCapacete = pgTable("epi_cores_capacete", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        cor: varchar({ length: 50 }).notNull(),
        hexColor: varchar({ length: 10 }),
        funcoes: text().notNull(),
        descricao: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("ecc_company").on(table.companyId),
]);

// Vida Útil Padrão por Tipo de EPI (em meses)
export const epiVidaUtil = pgTable("epi_vida_util", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        nomeEpi: varchar({ length: 255 }).notNull(),
        categoriaEpi: varchar({ length: 100 }),
        vidaUtilMeses: integer().notNull(),
        observacoes: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("evu_company").on(table.companyId),
]);

// Assinaturas Digitais de Entrega/Devolução de EPI
export const epiAssinaturas = pgTable("epi_assinaturas", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        deliveryId: integer(),
        employeeId: integer().notNull(),
        tipo: text().notNull(),
        assinaturaUrl: text().notNull(),
        assinadoEm: timestamp({ mode: 'string' }).defaultNow().notNull(),
        ipAddress: varchar({ length: 45 }),
        userAgent: text(),
        entregadorNome: varchar({ length: 255 }),
        entregadorUserId: integer(),
        // Campos de auditoria
        hashSha256: varchar({ length: 64 }),
        latitude: varchar({ length: 20 }),
        longitude: varchar({ length: 20 }),
        geoAccuracy: varchar({ length: 20 }),
        termoAceito: smallint().default(0),
        textoTermo: text(),
        dispositivoInfo: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("eas_company").on(table.companyId),
        index("eas_delivery").on(table.deliveryId),
        index("eas_employee").on(table.employeeId),
]);

// Treinamentos Vinculados a EPIs (NRs exigidas)
export const epiTreinamentosVinculados = pgTable("epi_treinamentos_vinculados", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        nomeEpi: varchar({ length: 255 }).notNull(),
        categoriaEpi: varchar({ length: 100 }),
        normaExigida: varchar({ length: 50 }).notNull(),
        nomeTreinamento: varchar({ length: 255 }).notNull(),
        obrigatorio: smallint().default(1).notNull(),
        descricao: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("etv_company").on(table.companyId),
        index("etv_norma").on(table.normaExigida),
]);

// Estoque Mínimo por EPI por Obra (para alertas de reposição)
export const epiEstoqueMinimo = pgTable("epi_estoque_minimo", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        epiId: integer().notNull(),
        obraId: integer(),
        quantidadeMinima: integer().notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("eem_company").on(table.companyId),
        index("eem_epi").on(table.epiId),
        index("eem_obra").on(table.obraId),
]);

// Checklist de EPI gerado na contratação
export const epiChecklists = pgTable("epi_checklists", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        kitId: integer(),
        tipo: text().default('contratacao').notNull(),
        status: text().default('pendente').notNull(),
        observacoes: text(),
        criadoPor: varchar({ length: 255 }),
        criadoPorUserId: integer(),
        concluidoEm: timestamp({ mode: 'string' }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("ecl_company").on(table.companyId),
        index("ecl_employee").on(table.employeeId),
        index("ecl_status").on(table.status),
]);

// Itens do Checklist de EPI
export const epiChecklistItems = pgTable("epi_checklist_items", {
        id: serial().notNull(),
        checklistId: integer().notNull(),
        nomeEpi: varchar({ length: 255 }).notNull(),
        categoria: text().default('EPI').notNull(),
        quantidade: integer().default(1).notNull(),
        entregue: smallint().default(0).notNull(),
        devolvido: smallint().default(0).notNull(),
        epiId: integer(),
        deliveryId: integer(),
        dataEntrega: date({ mode: 'string' }),
        dataDevolucao: date({ mode: 'string' }),
        observacoes: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("ecli_checklist").on(table.checklistId),
        index("ecli_epi").on(table.epiId),
]);

// Análises de IA para transferências de EPI
export const epiAiAnalises = pgTable("epi_ai_analises", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        tipo: text().default('manual').notNull(),
        resultado: text().notNull(),
        sugestoes: json(),
        status: text().default('nova').notNull(),
        aplicadaPor: varchar({ length: 255 }),
        aplicadaPorUserId: integer(),
        aplicadaEm: timestamp({ mode: 'string' }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("eaia_company").on(table.companyId),
        index("eaia_status").on(table.status),
]);

// ============================================================
// ALERTA DE CAPACIDADE DE CONTRATAÇÃO (EPI)
// ============================================================
export const epiAlertaCapacidade = pgTable("epi_alerta_capacidade", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        limiar: integer().default(5).notNull(), // Abaixo desse número, dispara alerta
        ativo: smallint().default(1).notNull(),
        emailDestinatarios: text(), // JSON array de emails adicionais (além dos notification_recipients)
        ultimoAlertaEm: timestamp({ mode: 'string' }),
        ultimaCapacidade: integer(),
        intervaloMinHoras: integer().default(24).notNull(), // Mínimo de horas entre alertas
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("eac_company").on(table.companyId),
]);

export const epiAlertaCapacidadeLog = pgTable("epi_alerta_capacidade_log", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        capacidade: integer().notNull(),
        limiar: integer().notNull(),
        gargaloItem: varchar({ length: 255 }),
        gargaloEstoque: integer(),
        destinatariosEnviados: text(), // JSON array
        emailsEnviados: integer().default(0).notNull(),
        emailsErros: integer().default(0).notNull(),
        enviadoEm: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("eacl_company").on(table.companyId),
        index("eacl_enviado").on(table.enviadoEm),
]);


// ============================================================
// BACKUPS
// ============================================================

export const backups = pgTable("backups", {
        id: serial().notNull(),
        tipo: text().notNull().default("automatico"),
        status: text().notNull().default("em_andamento"),
        tabelasExportadas: integer().default(0).notNull(),
        registrosExportados: integer().default(0).notNull(),
        tamanhoBytes: integer().default(0).notNull(),
        s3Key: varchar({ length: 500 }),
        s3Url: varchar({ length: 1000 }),
        erro: text(),
        iniciadoPor: varchar({ length: 255 }).default("Sistema"),
        iniciadoEm: timestamp({ mode: 'string' }).defaultNow().notNull(),
        concluidoEm: timestamp({ mode: 'string' }),
}, (table) => [
        index("bkp_status").on(table.status),
        index("bkp_tipo").on(table.tipo),
        index("bkp_iniciado").on(table.iniciadoEm),
]);


export const contractTemplates = pgTable("contract_templates", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        tipo: text().notNull(),
        nome: varchar({ length: 255 }).notNull(),
        conteudoHtml: text().notNull(),
        ativo: smallint().default(1).notNull(),
        criadoPor: varchar({ length: 255 }),
        criadoPorUserId: integer(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("ct_company").on(table.companyId),
        index("ct_tipo").on(table.tipo),
        index("ct_ativo").on(table.ativo),
]);

export const employeeContracts = pgTable("employee_contracts", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        templateId: integer(),
        tipo: text().notNull(),
        status: text().default('vigente').notNull(),
        dataInicio: date({ mode: 'string' }).notNull(),
        dataFim: date({ mode: 'string' }),
        prazoExperienciaDias: integer(),
        prazoProrrogacaoDias: integer(),
        dataProrrogacao: date({ mode: 'string' }),
        dataEfetivacao: date({ mode: 'string' }),
        salarioBase: varchar({ length: 20 }),
        valorHora: varchar({ length: 20 }),
        funcao: varchar({ length: 100 }),
        jornadaTrabalho: text(),
        localTrabalho: text(),
        conteudoGerado: text(),
        contratoAssinadoUrl: text(),
        contratoAssinadoKey: text(),
        prorrogacaoAssinadaUrl: text(),
        prorrogacaoAssinadaKey: text(),
        observacoes: text(),
        contratoAnteriorId: integer(),
        criadoPor: varchar({ length: 255 }),
        criadoPorUserId: integer(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("ec_company").on(table.companyId),
        index("ec_employee").on(table.employeeId),
        index("ec_tipo").on(table.tipo),
        index("ec_status").on(table.status),
        index("ec_data_inicio").on(table.dataInicio),
        index("ec_data_fim").on(table.dataFim),
]);


export const skills = pgTable("skills", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        nome: varchar({ length: 255 }).notNull(),
        categoria: varchar({ length: 100 }),
        descricao: text(),
        deletedAt: timestamp("deleted_at", { mode: 'string' }),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("sk_company").on(table.companyId),
        index("sk_categoria").on(table.categoria),
]);

export const employeeSkills = pgTable("employee_skills", {
        id: serial().notNull(),
        employeeId: integer().notNull(),
        skillId: integer().notNull(),
        companyId: integer().notNull(),
        nivel: text().default('Basico').notNull(),
        tempoExperiencia: varchar({ length: 100 }),
        observacao: text(),
        deletedAt: timestamp("deleted_at", { mode: 'string' }),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("es_employee").on(table.employeeId),
        index("es_skill").on(table.skillId),
        index("es_company").on(table.companyId),
]);

// ============================================================
// MÓDULO ORÇAMENTO
// ============================================================

export const orcamentos = pgTable("orcamentos", {
  id: serial().notNull(),
  companyId: integer().notNull(),
  obraId: integer(),
  codigo: varchar({ length: 100 }).notNull(),
  descricao: varchar({ length: 500 }),
  revisao: varchar({ length: 20 }),
  cliente: varchar({ length: 255 }),
  local: varchar({ length: 255 }),
  dataBase: varchar({ length: 20 }),
  tempoObraMeses: integer(),
  dataInicio: date("data_inicio", { mode: 'string' }),
  eventualAtrasoMeses: integer("eventual_atraso_meses").default(0),
  dissidioPctBdi: numeric("dissidio_pct", { precision: 6, scale: 4 }).default('0.0500'),
  dissidioDataBdi: date("dissidio_data", { mode: 'string' }),
  dissidioIncidenciaMeses: integer("dissidio_incidencia_meses").default(0),
  areaIntervencao: numeric({ precision: 14, scale: 2 }),
  bdiPercentual: numeric({ precision: 8, scale: 4 }),
  metaPercentual: numeric({ precision: 8, scale: 4 }).default('0.2000'),
  totalVenda: numeric({ precision: 18, scale: 2 }),
  valorNegociado: numeric("valor_negociado", { precision: 18, scale: 2 }),
  totalCusto: numeric({ precision: 18, scale: 2 }),
  totalMeta: numeric({ precision: 18, scale: 2 }),
  totalMateriais: numeric({ precision: 18, scale: 2 }),
  totalMdo: numeric({ precision: 18, scale: 2 }),
  totalEquipamentos: numeric({ precision: 18, scale: 2 }),
  status: text().default('rascunho'),
  metaAprovadaPor: varchar({ length: 255 }),
  metaAprovadaEm: timestamp({ mode: 'string' }),
  metaAprovadaUserId: integer(),
  importadoPor: varchar({ length: 255 }),
  importadoEm: timestamp({ mode: 'string' }),
  deletedAt: timestamp("deleted_at", { mode: 'string' }),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index("orc_company").on(table.companyId),
  index("orc_obra").on(table.obraId),
  index("orc_status").on(table.status),
]);

export const orcamentoItens = pgTable("orcamento_itens", {
  id: serial().notNull(),
  orcamentoId: integer().notNull(),
  companyId: integer().notNull(),
  eapCodigo: varchar({ length: 50 }).notNull(),
  nivel: integer().notNull(),
  tipo: varchar({ length: 50 }),
  composicaoTipo: varchar({ length: 20 }),
  servicoCodigo: varchar({ length: 50 }),
  descricao: varchar({ length: 1000 }).notNull(),
  unidade: varchar({ length: 30 }),
  quantidade: numeric({ precision: 18, scale: 4 }),
  custoUnitMat: numeric({ precision: 18, scale: 4 }),
  custoUnitMdo: numeric({ precision: 18, scale: 4 }),
  custoUnitTotal: numeric({ precision: 18, scale: 4 }),
  vendaUnitTotal: numeric({ precision: 18, scale: 4 }),
  metaUnitTotal: numeric({ precision: 18, scale: 4 }),
  custoTotalMat: numeric({ precision: 18, scale: 2 }),
  custoTotalMdo: numeric({ precision: 18, scale: 2 }),
  custoTotal: numeric({ precision: 18, scale: 2 }),
  vendaTotal: numeric({ precision: 18, scale: 2 }),
  metaTotal: numeric({ precision: 18, scale: 2 }),
  abcServico: varchar({ length: 5 }),
  ordem: integer(),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index("orci_orcamento").on(table.orcamentoId),
  index("orci_company").on(table.companyId),
  index("orci_eap").on(table.eapCodigo),
]);

// ── SEC (Serviços Extras Contratuais) ────────────────────────────────────────
export const orcamentoSecs = pgTable("orcamento_secs", {
  id:               serial().primaryKey(),
  orcamentoId:      integer().notNull(),
  companyId:        integer().notNull(),
  numero:           integer().notNull(),
  codigo:           varchar({ length: 100 }).notNull(),
  descricao:        varchar({ length: 500 }),
  fase:             varchar({ length: 30 }).notNull().default('elaboracao'),
  bdiPercentual:    numeric({ precision: 8,  scale: 4 }),
  totalCusto:       numeric({ precision: 18, scale: 2 }).default('0'),
  totalVenda:       numeric({ precision: 18, scale: 2 }).default('0'),
  totalMateriais:   numeric({ precision: 18, scale: 2 }).default('0'),
  totalMdo:         numeric({ precision: 18, scale: 2 }).default('0'),
  totalEquipamentos:numeric({ precision: 18, scale: 2 }).default('0'),
  totalMeta:        numeric({ precision: 18, scale: 2 }).default('0'),
  createdAt:        timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
  deletedAt:        timestamp("deleted_at", { mode: 'string' }),
}, (table) => [
  index("sec_orcamento").on(table.orcamentoId),
  index("sec_company").on(table.companyId),
]);

export const orcamentoSecItens = pgTable("orcamento_sec_itens", {
  id:             serial().primaryKey(),
  secId:          integer().notNull(),
  companyId:      integer().notNull(),
  eapCodigo:      varchar({ length: 50 }).notNull(),
  nivel:          integer().notNull(),
  tipo:           varchar({ length: 50 }),
  descricao:      varchar({ length: 1000 }).notNull(),
  unidade:        varchar({ length: 30 }),
  quantidade:     numeric({ precision: 18, scale: 4 }),
  custoUnitMat:   numeric({ precision: 18, scale: 4 }),
  custoUnitMdo:   numeric({ precision: 18, scale: 4 }),
  custoUnitTotal: numeric({ precision: 18, scale: 4 }),
  vendaUnitTotal: numeric({ precision: 18, scale: 4 }),
  custoTotalMat:  numeric({ precision: 18, scale: 2 }),
  custoTotalMdo:  numeric({ precision: 18, scale: 2 }),
  custoTotal:     numeric({ precision: 18, scale: 2 }),
  vendaTotal:     numeric({ precision: 18, scale: 2 }),
  ordem:          integer(),
  createdAt:      timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index("seci_sec").on(table.secId),
  index("seci_company").on(table.companyId),
]);

export const orcamentoInsumos = pgTable("orcamento_insumos", {
  id: serial().notNull(),
  orcamentoId: integer().notNull(),
  companyId: integer().notNull(),
  codigo: varchar({ length: 50 }),
  descricao: varchar({ length: 500 }).notNull(),
  unidade: varchar({ length: 30 }),
  tipo: varchar({ length: 100 }),
  precoUnitBase: numeric({ precision: 18, scale: 4 }),
  precoUnitComEncargos: numeric({ precision: 18, scale: 4 }),
  quantidadeTotal: numeric({ precision: 18, scale: 4 }),
  custoTotal: numeric({ precision: 18, scale: 2 }),
  percentualTotal: numeric({ precision: 8, scale: 6 }),
  percentualAcumulado: numeric({ precision: 8, scale: 6 }),
  curvaAbc: varchar({ length: 1 }),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index("orins_orcamento").on(table.orcamentoId),
  index("orins_company").on(table.companyId),
  index("orins_tipo").on(table.tipo),
]);

export const orcamentoBdi = pgTable("orcamento_bdi", {
  id: serial().notNull(),
  orcamentoId: integer().notNull(),
  companyId: integer().notNull(),
  nomeAba: varchar({ length: 100 }).default('BDI'),
  codigo: varchar({ length: 30 }),
  descricao: varchar({ length: 255 }),
  percentual: numeric({ precision: 10, scale: 6 }),
  valorAbsoluto: numeric({ precision: 18, scale: 2 }),
  ordem: integer(),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index("orbdi_orcamento").on(table.orcamentoId),
]);

// ============================================================
// BDI SUB-ABAS — tabelas dedicadas por aba da planilha BDI
// Cada aba tem estrutura própria; BDI principal agrega delas.
// ============================================================

export const bdiIndiretos = pgTable("bdi_indiretos", {
  id:                    serial("id").primaryKey(),
  orcamentoId:           integer("orcamento_id").notNull(),
  companyId:             integer("company_id").notNull(),
  secao:                 varchar("secao",              { length: 20  }),
  codigo:                varchar("codigo",             { length: 30  }),
  descricao:             varchar("descricao",          { length: 255 }),
  modalidade:            varchar("modalidade",         { length: 50  }),
  tipoContrato:          varchar("tipo_contrato",      { length: 30  }),
  quantidade:            numeric("quantidade",         { precision: 10, scale: 3 }).default("0"),
  mesesObra:             numeric("meses_obra",         { precision: 10, scale: 2 }).default("0"),
  salarioBase:           numeric("salario_base",       { precision: 18, scale: 2 }).default("0"),
  bonusMensal:           numeric("bonus_mensal",       { precision: 18, scale: 2 }).default("0"),
  txTransferencia:       numeric("tx_transferencia",   { precision: 10, scale: 6 }).default("0"),
  decimoTerceiroFerias:  numeric("decimo_terceiro_ferias", { precision: 18, scale: 2 }).default("0"),
  valorHora:             numeric("valor_hora",         { precision: 18, scale: 6 }).default("0"),
  totalMes:              numeric("total_mes",          { precision: 18, scale: 2 }).default("0"),
  totalObra:             numeric("total_obra",         { precision: 18, scale: 2 }).default("0"),
  // CI-02+ specific fields (Refeições, Transportes, Equipamentos, Despesas, Segurança, Consultoria)
  unidade:               varchar("unidade",            { length: 20 }),
  vidaUtil:              numeric("vida_util",          { precision: 10, scale: 2 }).default("0"),
  deltaT:                numeric("delta_t",            { precision: 10, scale: 2 }),
  pctIncidencia:         numeric("pct_incidencia",     { precision: 10, scale: 6 }).default("1"),
  valorUnit:             numeric("valor_unit",         { precision: 18, scale: 2 }).default("0"),
  totalLinha:            numeric("total_linha",        { precision: 18, scale: 2 }).default("0"),
  isHeader:              boolean("is_header").default(false),
  ordem:                 integer("ordem").default(0),
  createdAt:             timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_bdind_orc").on(t.orcamentoId)]);

export const bdiFd = pgTable("bdi_fd", {
  id:            serial("id").primaryKey(),
  orcamentoId:   integer("orcamento_id").notNull(),
  companyId:     integer("company_id").notNull(),
  codigoInsumo:  varchar("codigo_insumo", { length: 30  }),
  descricao:     varchar("descricao",     { length: 255 }),
  unidade:       varchar("unidade",       { length: 20  }),
  qtdOrcada:     numeric("qtd_orcada",    { precision: 18, scale: 4 }).default("0"),
  precoUnit:     numeric("preco_unit",    { precision: 18, scale: 6 }).default("0"),
  total:         numeric("total",         { precision: 18, scale: 2 }).default("0"),
  fornecedor:    varchar("fornecedor",    { length: 255 }),
  ordem:         integer("ordem").default(0),
  createdAt:     timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_bdifd_orc").on(t.orcamentoId)]);

export const bdiAdmCentral = pgTable("bdi_adm_central", {
  id:          serial("id").primaryKey(),
  orcamentoId: integer("orcamento_id").notNull(),
  companyId:   integer("company_id").notNull(),
  codigo:      varchar("codigo",    { length: 30  }),
  descricao:   varchar("descricao", { length: 255 }),
  base:        numeric("base",      { precision: 18, scale: 2 }).default("0"),
  tempoObra:   numeric("tempo_obra",{ precision: 10, scale: 2 }).default("0"),
  encargos:    numeric("encargos",  { precision: 18, scale: 4 }).default("0"),
  beneficios:  numeric("beneficios",{ precision: 18, scale: 2 }).default("0"),
  total:       numeric("total",     { precision: 18, scale: 2 }).default("0"),
  isHeader:    boolean("is_header").default(false),
  ordem:       integer("ordem").default(0),
  createdAt:   timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_bdiadm_orc").on(t.orcamentoId)]);

export const bdiDespesasFinanceiras = pgTable("bdi_despesas_financeiras", {
  id:          serial("id").primaryKey(),
  orcamentoId: integer("orcamento_id").notNull(),
  companyId:   integer("company_id").notNull(),
  codigo:      varchar("codigo",    { length: 30  }),
  descricao:   varchar("descricao", { length: 255 }),
  valor:       numeric("valor",     { precision: 18, scale: 8 }).default("0"),
  unidade:     varchar("unidade",   { length: 50  }),
  isHeader:    boolean("is_header").default(false),
  ordem:       integer("ordem").default(0),
  createdAt:   timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_bdidf_orc").on(t.orcamentoId)]);

export const bdiTributos = pgTable("bdi_tributos", {
  id:              serial("id").primaryKey(),
  orcamentoId:     integer("orcamento_id").notNull(),
  companyId:       integer("company_id").notNull(),
  codigo:          varchar("codigo",          { length: 30  }),
  descricao:       varchar("descricao",       { length: 255 }),
  aliquota:        numeric("aliquota",        { precision: 10, scale: 8 }).default("0"),
  baseCalculo:     varchar("base_calculo",    { length: 50  }),
  valorCalculado:  numeric("valor_calculado", { precision: 18, scale: 2 }).default("0"),
  isHeader:        boolean("is_header").default(false),
  ordem:           integer("ordem").default(0),
  createdAt:       timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_bditrib_orc").on(t.orcamentoId)]);

export const bdiTaxaComercializacao = pgTable("bdi_taxa_comercializacao", {
  id:          serial("id").primaryKey(),
  orcamentoId: integer("orcamento_id").notNull(),
  companyId:   integer("company_id").notNull(),
  codigo:      varchar("codigo",    { length: 30  }),
  descricao:   varchar("descricao", { length: 255 }),
  percentual:  numeric("percentual",{ precision: 10, scale: 8 }).default("0"),
  valor:       numeric("valor",     { precision: 18, scale: 2 }).default("0"),
  isHeader:    boolean("is_header").default(false),
  ordem:       integer("ordem").default(0),
  createdAt:   timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_bditc_orc").on(t.orcamentoId)]);

// ============================================================
// CONTROLE DE REVISÕES DE ORÇAMENTO
// Registra o diff entre versões a cada reimportação de planilha.
// ============================================================

export const orcamentoRevisoes = pgTable("orcamento_revisoes", {
  id:               serial().notNull(),
  orcamentoId:      integer("orcamento_id").notNull(),
  companyId:        integer("company_id").notNull(),
  revisaoLabel:     varchar("revisao_label", { length: 50 }),
  userName:         varchar("user_name", { length: 100 }),
  createdAt:        timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
  totalCustoAntes:  numeric("total_custo_antes",  { precision: 18, scale: 2 }).default('0'),
  totalCustoDepois: numeric("total_custo_depois", { precision: 18, scale: 2 }).default('0'),
  totalVendaAntes:  numeric("total_venda_antes",  { precision: 18, scale: 2 }).default('0'),
  totalVendaDepois: numeric("total_venda_depois", { precision: 18, scale: 2 }).default('0'),
  itensAdicionados: integer("itens_adicionados").default(0),
  itensRemovidos:   integer("itens_removidos").default(0),
  itensAlterados:   integer("itens_alterados").default(0),
  resumo:           text(),
  diffJson:         text("diff_json"),
}, (table) => [
  index("idx_orc_revisoes_orc").on(table.orcamentoId),
]);

// ============================================================
// CATÁLOGO GLOBAL DE INSUMOS E COMPOSIÇÕES
// Populado automaticamente a cada importação de orçamento.
// Serve como base para criação de orçamentos diretamente no sistema.
// ============================================================

export const insumosCatalogo = pgTable("insumos_catalogo", {
  id: serial().notNull(),
  companyId: integer().notNull(),
  codigo: varchar({ length: 100 }),
  descricao: varchar({ length: 1000 }).notNull(),
  unidade: varchar({ length: 30 }),
  tipo: varchar({ length: 100 }),
  precoUnitario: numeric({ precision: 18, scale: 4 }),
  precoMin: numeric({ precision: 18, scale: 4 }),
  precoMax: numeric({ precision: 18, scale: 4 }),
  precoMedio: numeric({ precision: 18, scale: 4 }),
  totalOrcamentos: integer().default(0).notNull(),
  totalQuantidade: numeric({ precision: 18, scale: 4 }),
  chaveNorm: varchar({ length: 500 }).notNull(),
  ultimaAtualizacao: timestamp({ mode: 'string' }).defaultNow().notNull(),
  criadoEm: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index("insc_company").on(table.companyId),
  index("insc_codigo").on(table.codigo),
  index("insc_chave").on(table.chaveNorm),
]);

export const composicoesCatalogo = pgTable("composicoes_catalogo", {
  id: serial().notNull(),
  companyId: integer().notNull(),
  codigo: varchar({ length: 100 }),
  descricao: varchar({ length: 1000 }).notNull(),
  unidade: varchar({ length: 30 }),
  tipo: varchar({ length: 100 }),
  custoUnitMat: numeric({ precision: 18, scale: 4 }),
  custoUnitMdo: numeric({ precision: 18, scale: 4 }),
  custoUnitTotal: numeric({ precision: 18, scale: 4 }),
  totalOrcamentos: integer().default(0).notNull(),
  chaveNorm: varchar({ length: 500 }).notNull(),
  ultimaAtualizacao: timestamp({ mode: 'string' }).defaultNow().notNull(),
  criadoEm: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index("compc_company").on(table.companyId),
  index("compc_codigo").on(table.codigo),
  index("compc_chave").on(table.chaveNorm),
]);

export const insumosGrupos = pgTable("insumos_grupos", {
  id:        serial("id").notNull(),
  companyId: integer("company_id").notNull(),
  nome:      varchar("nome", { length: 150 }).notNull(),
  criadoEm:  timestamp("criado_em", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index("ig_company").on(table.companyId),
]);

export const composicaoInsumos = pgTable("composicao_insumos", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  composicaoCodigo: varchar("composicao_codigo", { length: 100 }).notNull(),
  insumoCodigo: varchar("insumo_codigo", { length: 100 }),
  insumoDescricao: varchar("insumo_descricao", { length: 1000 }),
  unidade: varchar({ length: 30 }),
  quantidade: numeric({ precision: 18, scale: 6 }).default('0'),
  precoUnitario: numeric("preco_unitario", { precision: 18, scale: 4 }).default('0'),
  alocacaoMat: numeric("alocacao_mat", { precision: 18, scale: 6 }).default('0'),
  alocacaoMdo: numeric("alocacao_mdo", { precision: 18, scale: 6 }).default('0'),
  custoUnitTotal: numeric("custo_unit_total", { precision: 18, scale: 6 }).default('0'),
  criadoEm: timestamp("criado_em", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index("ci_company").on(table.companyId),
  index("ci_comp").on(table.composicaoCodigo),
  index("ci_insumo").on(table.insumoCodigo),
]);

export const encargosSociais = pgTable("encargos_sociais", {
  id:        serial().notNull().primaryKey(),
  companyId: integer("company_id").notNull(),
  grupo:     varchar("grupo", { length: 5 }).notNull(),
  codigo:    varchar("codigo", { length: 5 }).notNull(),
  descricao: text("descricao").notNull(),
  valor:     numeric({ precision: 10, scale: 4 }).notNull().default('0'),
  calculado: boolean("calculado").notNull().default(false),
  ordem:     integer("ordem").notNull().default(0),
});

// ── Módulo Planejamento ────────────────────────────────────────────────────
export const planejamentoProjetos = pgTable("planejamento_projetos", {
  id:                     serial().primaryKey(),
  companyId:              integer("company_id").notNull(),
  obraId:                 integer("obra_id"),
  orcamentoId:            integer("orcamento_id"),
  nome:                   varchar({ length: 300 }).notNull(),
  cliente:                varchar({ length: 200 }),
  local:                  varchar({ length: 200 }),
  responsavel:            varchar({ length: 200 }),
  dataInicio:             date("data_inicio"),
  dataTerminoContratual:  date("data_termino_contratual"),
  valorContrato:          numeric("valor_contrato", { precision: 18, scale: 2 }).default("0"),
  status:                 varchar({ length: 50 }).default("Em andamento"),
  descricao:              text(),
  criadoEm:               timestamp("criado_em").defaultNow(),
  atualizadoEm:           timestamp("atualizado_em").defaultNow(),
});

export const planejamentoRevisoes = pgTable("planejamento_revisoes", {
  id:           serial().primaryKey(),
  projetoId:    integer("projeto_id").notNull(),
  numero:       integer().notNull().default(0),
  descricao:    varchar({ length: 200 }),
  dataRevisao:  date("data_revisao").notNull(),
  motivo:       text(),
  responsavel:  varchar({ length: 200 }),
  aprovadoPor:  varchar("aprovado_por", { length: 200 }),
  status:       varchar({ length: 50 }).default("aprovada"),
  observacao:   text(),
  isBaseline:   boolean("is_baseline").default(false),
  consolidado:  boolean("consolidado").default(false),
  criadoEm:     timestamp("criado_em").defaultNow(),
});

export const planejamentoAtividades = pgTable("planejamento_atividades", {
  id:                   serial().primaryKey(),
  revisaoId:            integer("revisao_id").notNull(),
  projetoId:            integer("projeto_id").notNull(),
  eapCodigo:            varchar("eap_codigo", { length: 50 }),
  nome:                 varchar({ length: 500 }).notNull(),
  nivel:                integer().default(1),
  dataInicio:           date("data_inicio"),
  dataFim:              date("data_fim"),
  duracaoDias:          integer("duracao_dias").default(0),
  predecessora:         varchar({ length: 100 }),
  pesoFinanceiro:       numeric("peso_financeiro", { precision: 10, scale: 4 }).default("0"),
  recursoPrincipal:     varchar("recurso_principal", { length: 200 }),
  quantidadePlanejada:  numeric("quantidade_planejada", { precision: 18, scale: 4 }).default("0"),
  unidade:              varchar({ length: 30 }),
  ordem:                integer().default(0),
  isGrupo:              boolean("is_grupo").default(false),
  criadoEm:             timestamp("criado_em").defaultNow(),
});

export const planejamentoAvancos = pgTable("planejamento_avancos", {
  id:                   serial().primaryKey(),
  projetoId:            integer("projeto_id").notNull(),
  atividadeId:          integer("atividade_id").notNull(),
  revisaoId:            integer("revisao_id").notNull(),
  semana:               date().notNull(),
  percentualAcumulado:  numeric("percentual_acumulado", { precision: 8, scale: 4 }).default("0"),
  percentualSemanal:    numeric("percentual_semanal", { precision: 8, scale: 4 }).default("0"),
  observacao:           text(),
  criadoEm:             timestamp("criado_em").defaultNow(),
  criadoPor:            varchar("criado_por", { length: 200 }),
});

export const planejamentoRefis = pgTable("planejamento_refis", {
  id:                       serial().primaryKey(),
  projetoId:                integer("projeto_id").notNull(),
  semana:                   date().notNull(),
  numero:                   integer(),
  dataEmissao:              date("data_emissao"),
  avancoPrevisto:           numeric("avanco_previsto", { precision: 8, scale: 4 }).default("0"),
  avancoRealizado:          numeric("avanco_realizado", { precision: 8, scale: 4 }).default("0"),
  avancoSemanalPrevisto:    numeric("avanco_semanal_previsto", { precision: 8, scale: 4 }).default("0"),
  avancoSemanalRealizado:   numeric("avanco_semanal_realizado", { precision: 8, scale: 4 }).default("0"),
  spi:                      numeric({ precision: 10, scale: 4 }).default("1"),
  cpi:                      numeric({ precision: 10, scale: 4 }).default("1"),
  custoPrevisto:            numeric("custo_previsto", { precision: 18, scale: 2 }).default("0"),
  custoRealizado:           numeric("custo_realizado", { precision: 18, scale: 2 }).default("0"),
  observacoes:              text(),
  status:                   varchar({ length: 50 }).default("rascunho"),
  criadoEm:                 timestamp("criado_em").defaultNow(),
  criadoPor:                varchar("criado_por", { length: 200 }),
  consolidadoPor:           varchar("consolidado_por", { length: 200 }),
  consolidadoEm:            timestamp("consolidado_em"),
  canceladoPor:             varchar("cancelado_por", { length: 200 }),
  canceladoEm:              timestamp("cancelado_em"),
});

export const planejamentoMedicaoConfig = pgTable("planejamento_medicao_config", {
  id:                serial().primaryKey(),
  projetoId:         integer("projeto_id").notNull().unique(),
  tipoMedicao:       varchar("tipo_medicao", { length: 20 }).notNull().default("avanco"),
  diaCorte:          integer("dia_corte").notNull().default(25),
  entrada:           numeric({ precision: 18, scale: 2 }).default("0"),
  numeroParcelas:    integer("numero_parcelas").default(6),
  inicioFaturamento: date("inicio_faturamento"),
  sinalPct:          numeric("sinal_pct", { precision: 10, scale: 2 }).default("0"),
  retencaoPct:       numeric("retencao_pct", { precision: 10, scale: 2 }).default("5"),
  dataInicioObra:    date("data_inicio_obra"),
  bloqueado:         boolean("bloqueado").default(false),
  criadoEm:          timestamp("criado_em").defaultNow(),
  atualizadoEm:      timestamp("atualizado_em").defaultNow(),
});

export const planejamentoMedicoes = pgTable("planejamento_medicoes", {
  id:                   serial().primaryKey(),
  projetoId:            integer("projeto_id").notNull(),
  numero:               integer().notNull().default(0),
  competencia:          varchar({ length: 7 }).notNull(),
  valorPrevisto:        numeric("valor_previsto",        { precision: 18, scale: 2 }).default("0"),
  valorMedido:          numeric("valor_medido",          { precision: 18, scale: 2 }).default("0"),
  percentualPrevisto:   numeric("percentual_previsto",   { precision: 10, scale: 4 }).default("0"),
  percentualMedido:     numeric("percentual_medido",     { precision: 10, scale: 4 }).default("0"),
  status:               varchar({ length: 50 }).default("pendente"),
  observacoes:          text(),
  criadoEm:             timestamp("criado_em").defaultNow(),
  atualizadoEm:         timestamp("atualizado_em").defaultNow(),
});

export const planejamentoCompras = pgTable("planejamento_compras", {
  id:                    serial().primaryKey(),
  projetoId:             integer("projeto_id").notNull(),
  revisao:               integer().notNull().default(1),
  fonte:                 varchar({ length: 20 }).notNull().default("manual"),
  item:                  varchar({ length: 300 }).notNull(),
  unidade:               varchar({ length: 50 }).default("un"),
  quantidade:            numeric({ precision: 18, scale: 3 }).default("1"),
  custoUnitario:         numeric("custo_unitario", { precision: 18, scale: 2 }).default("0"),
  dataNecessaria:        date("data_necessaria").notNull(),
  atividadeDataInicio:   date("atividade_data_inicio"),
  leadTime:              integer("lead_time").notNull().default(30),
  eapCodigo:             varchar("eap_codigo", { length: 100 }),
  dataPedido:            date("data_pedido"),
  status:                varchar({ length: 50 }).default("pendente"),
  fornecedor:            varchar({ length: 200 }),
  observacoes:           text(),
  criadoEm:              timestamp("criado_em").defaultNow(),
  atualizadoEm:          timestamp("atualizado_em").defaultNow(),
});

export const planejamentoComprasRevisoes = pgTable("planejamento_compras_revisoes", {
  id:                          serial().primaryKey(),
  projetoId:                   integer("projeto_id").notNull(),
  revisao:                     integer().notNull(),
  descricao:                   text(),
  leadTime:                    integer("lead_time").notNull().default(30),
  totalItens:                  integer("total_itens").notNull().default(0),
  totalCusto:                  numeric("total_custo", { precision: 18, scale: 2 }).notNull().default("0"),
  geradoEm:                    timestamp("gerado_em").defaultNow(),
  geradoPorRevisaoCronograma:  integer("gerado_por_revisao_cronograma"),
});

// ── IA Cronograma ──────────────────────────────────────────────────────────

export const iaCronogramaConhecimento = pgTable("ia_cronograma_conhecimento", {
  id:                   serial().primaryKey(),
  companyId:            integer("company_id"),
  palavrasChave:        text("palavras_chave").notNull(),
  tipoAtividade:        varchar("tipo_atividade", { length: 100 }),
  recursosEquipamentos: json("recursos_equipamentos").default([]),
  recursosEfetivo:      json("recursos_efetivo").default([]),
  sensibilidadeClima:   json("sensibilidade_clima").default({}),
  contextoObra:         text("contexto_obra"),
  confirmacoes:         integer().notNull().default(0),
  rejeicoes:            integer().notNull().default(0),
  fonte:                varchar({ length: 50 }).default("ia"),
  criadoPor:            varchar("criado_por", { length: 200 }),
  criadoEm:             timestamp("criado_em").defaultNow(),
  atualizadoEm:         timestamp("atualizado_em").defaultNow(),
});

export const iaCronogramaChat = pgTable("ia_cronograma_chat", {
  id:         serial().primaryKey(),
  projetoId:  integer("projeto_id").notNull(),
  companyId:  integer("company_id"),
  sessaoId:   varchar("sessao_id", { length: 50 }).notNull(),
  role:       varchar({ length: 20 }).notNull(),
  conteudo:   text().notNull(),
  tipo:       varchar({ length: 30 }).default("chat"),
  criadoEm:   timestamp("criado_em").defaultNow(),
});

export const iaCronogramaAlertas = pgTable("ia_cronograma_alertas", {
  id:             serial().primaryKey(),
  projetoId:      integer("projeto_id").notNull(),
  atividadeId:    integer("atividade_id"),
  nomeAtividade:  varchar("nome_atividade", { length: 500 }),
  dataAlerta:     date("data_alerta").notNull(),
  tipoAlerta:     varchar("tipo_alerta", { length: 50 }).notNull(),
  severidade:     varchar({ length: 20 }).notNull().default("media"),
  descricao:      text(),
  reconhecido:    boolean().notNull().default(false),
  geradoEm:       timestamp("gerado_em").defaultNow(),
});

export const iaCronogramaCenarios = pgTable("ia_cronograma_cenarios", {
  id:                serial().primaryKey(),
  projetoId:         integer("projeto_id").notNull(),
  companyId:         integer("company_id"),
  titulo:            varchar({ length: 200 }).notNull(),
  descricao:         text(),
  tipoCenario:       varchar("tipo_cenario", { length: 50 }).default("outro"),
  parametros:        json("parametros").default({}),
  resultadoIA:       text("resultado_ia"),
  planoAcao:         text("plano_acao"),
  atividadesAfetadas: json("atividades_afetadas").default([]),
  status:            varchar({ length: 30 }).default("rascunho"),
  aprovadoEm:        timestamp("aprovado_em"),
  aprovadoPor:       varchar("aprovado_por", { length: 200 }),
  criadoPor:         varchar("criado_por", { length: 200 }),
  criadoEm:          timestamp("criado_em").defaultNow(),
});

export const iaCronogramaMonitoramento = pgTable("ia_cronograma_monitoramento", {
  id:           serial().primaryKey(),
  cenarioId:    integer("cenario_id").notNull(),
  projetoId:    integer("projeto_id").notNull(),
  companyId:    integer("company_id"),
  semana:       varchar({ length: 10 }).notNull(),
  avancoReal:   numeric("avanco_real", { precision: 6, scale: 2 }),
  spiFim:       numeric("spi_fim", { precision: 6, scale: 4 }),
  custoRealizado: numeric("custo_realizado", { precision: 16, scale: 2 }),
  observacao:   text(),
  status:       varchar({ length: 20 }).default("no_prazo"),
  registradoPor: varchar("registrado_por", { length: 200 }),
  criadoEm:     timestamp("criado_em").defaultNow(),
});

export const orcamentoParametros = pgTable("orcamento_parametros", {
  id:           serial().notNull().primaryKey(),
  companyId:    integer().notNull().unique(),
  ls:           numeric({ precision: 10, scale: 4 }).notNull().default('0'),
  he:           numeric({ precision: 10, scale: 4 }).notNull().default('0'),
  criadoEm:     timestamp({ mode: 'string' }).defaultNow().notNull(),
  atualizadoEm: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const lobConfig = pgTable("lob_config", {
  id:                   serial().primaryKey(),
  projetoId:            integer("projeto_id").notNull().unique(),
  bufferMinimoDias:     integer("buffer_minimo_dias").notNull().default(5),
  ritmoAlvoPavsSemana:  numeric("ritmo_alvo_pavs_semana", { precision: 10, scale: 2 }).default("1.0"),
  pavimentosExcluidos:  json("pavimentos_excluidos").default([]),
  disciplinasConfig:    json("disciplinas_config").default([]),
  criadoEm:             timestamp("criado_em").defaultNow(),
  atualizadoEm:         timestamp("atualizado_em").defaultNow(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRAÇÃO MAS CONTROLE — CONFIGURAÇÃO E LOGS DE MIGRAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════

export const masControleConfig = pgTable("mas_controle_config", {
  id:           serial().primaryKey(),
  companyId:    integer("company_id").notNull().unique(),
  loginEmail:   varchar("login_email", { length: 255 }),
  token:        varchar({ length: 500 }),
  apiOk:        boolean("api_ok").default(false),
  migratedAt:   timestamp("migrated_at", { mode: 'string' }),
  criadoEm:     timestamp("criado_em", { mode: 'string' }).defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em", { mode: 'string' }).defaultNow().notNull(),
});

export const migrationLogs = pgTable("migration_logs", {
  id:               serial().primaryKey(),
  companyId:        integer("company_id").notNull(),
  fonte:            varchar({ length: 50 }).notNull().default("mas_controle"),
  tipoDado:         varchar("tipo_dado", { length: 50 }).notNull(),
  totalEncontrado:  integer("total_encontrado").default(0),
  totalImportado:   integer("total_importado").default(0),
  totalDuplicado:   integer("total_duplicado").default(0),
  totalErro:        integer("total_erro").default(0),
  detalhes:         json().default([]),
  executadoPorId:   integer("executado_por_id"),
  executadoPorNome: varchar("executado_por_nome", { length: 255 }),
  via:              varchar({ length: 20 }).default("csv"),
  executadoEm:      timestamp("executado_em", { mode: 'string' }).defaultNow().notNull(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// MÓDULO DE COMPRAS — FASE 1: FORNECEDORES + ALMOXARIFADO
// ═══════════════════════════════════════════════════════════════════════════════

export const fornecedores = pgTable("fornecedores", {
  id:               serial().primaryKey(),
  companyId:        integer("company_id").notNull(),
  cnpj:             varchar({ length: 18 }),
  razaoSocial:      varchar("razao_social", { length: 255 }).notNull(),
  nomeFantasia:     varchar("nome_fantasia", { length: 255 }),
  situacaoReceita:  varchar("situacao_receita", { length: 50 }),
  endereco:         varchar({ length: 255 }),
  numero:           varchar({ length: 20 }),
  complemento:      varchar({ length: 100 }),
  bairro:           varchar({ length: 100 }),
  cidade:           varchar({ length: 100 }),
  estado:           varchar({ length: 2 }),
  cep:              varchar({ length: 10 }),
  telefone:         varchar({ length: 20 }),
  email:            varchar({ length: 255 }),
  contatoNome:      varchar("contato_nome", { length: 255 }),
  contatoCelular:   varchar("contato_celular", { length: 20 }),
  contatoEmail:     varchar("contato_email", { length: 255 }),
  banco:            varchar({ length: 100 }),
  agencia:          varchar({ length: 20 }),
  conta:            varchar({ length: 30 }),
  pix:              varchar({ length: 255 }),
  categorias:       json().default([]),
  ativo:            boolean().default(true),
  observacoes:      text(),
  criadoEm:         timestamp("criado_em", { mode: 'string' }).defaultNow().notNull(),
  atualizadoEm:     timestamp("atualizado_em", { mode: 'string' }).defaultNow().notNull(),
});

export const clientes = pgTable("clientes", {
  id:               serial().primaryKey(),
  companyId:        integer("company_id").notNull(),
  tipo:             varchar({ length: 10 }).default("PJ").notNull(),
  cnpj:             varchar({ length: 18 }),
  cpf:              varchar({ length: 14 }),
  razaoSocial:      varchar("razao_social", { length: 255 }).notNull(),
  nomeFantasia:     varchar("nome_fantasia", { length: 255 }),
  situacaoReceita:  varchar("situacao_receita", { length: 50 }),
  endereco:         varchar({ length: 255 }),
  numero:           varchar({ length: 20 }),
  complemento:      varchar({ length: 100 }),
  bairro:           varchar({ length: 100 }),
  cidade:           varchar({ length: 100 }),
  estado:           varchar({ length: 2 }),
  cep:              varchar({ length: 10 }),
  telefone:         varchar({ length: 20 }),
  email:            varchar({ length: 255 }),
  contatoNome:      varchar("contato_nome", { length: 255 }),
  contatoCelular:   varchar("contato_celular", { length: 20 }),
  contatoEmail:     varchar("contato_email", { length: 255 }),
  observacoes:      text(),
  ativo:            boolean().default(true),
  criadoEm:         timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
  atualizadoEm:     timestamp("atualizado_em", { mode: "string" }).defaultNow().notNull(),
});

export const avaliacoesFornecedor = pgTable("avaliacoes_fornecedor", {
  id:           serial().primaryKey(),
  fornecedorId: integer("fornecedor_id").notNull(),
  companyId:    integer("company_id").notNull(),
  nota:         integer().notNull(),
  comentario:   text(),
  criadoPor:    integer("criado_por"),
  criadoEm:     timestamp("criado_em", { mode: 'string' }).defaultNow().notNull(),
});

export const almoxarifadoCategorias = pgTable("almoxarifado_categorias", {
  id:        serial().primaryKey(),
  companyId: integer("company_id").notNull(),
  nome:      varchar({ length: 150 }).notNull(),
  ordem:     integer().default(0),
  criadoEm:  timestamp("criado_em", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index("alm_cat_company").on(table.companyId),
]);

export const almoxarifadoItens = pgTable("almoxarifado_itens", {
  id:               serial().primaryKey(),
  companyId:        integer("company_id").notNull(),
  nome:             varchar({ length: 255 }).notNull(),
  unidade:          varchar({ length: 20 }).notNull().default("un"),
  categoria:        varchar({ length: 100 }),
  codigoInterno:    varchar("codigo_interno", { length: 50 }),
  quantidadeAtual:  numeric("quantidade_atual", { precision: 14, scale: 3 }).default("0"),
  quantidadeMinima: numeric("quantidade_minima", { precision: 14, scale: 3 }).default("0"),
  observacoes:      text(),
  fotoUrl:          text("foto_url"),
  ativo:            boolean().default(true),
  criadoEm:         timestamp("criado_em", { mode: 'string' }).defaultNow().notNull(),
  atualizadoEm:     timestamp("atualizado_em", { mode: 'string' }).defaultNow().notNull(),
});

export const almoxarifadoMovimentacoes = pgTable("almoxarifado_movimentacoes", {
  id:           serial().primaryKey(),
  companyId:    integer("company_id").notNull(),
  itemId:       integer("item_id").notNull(),
  tipo:         varchar({ length: 20 }).notNull(),
  quantidade:   numeric({ precision: 14, scale: 3 }).notNull(),
  obraId:       integer("obra_id"),
  obraNome:     varchar("obra_nome", { length: 255 }),
  motivo:       text(),
  usuarioId:    integer("usuario_id"),
  usuarioNome:  varchar("usuario_nome", { length: 255 }),
  observacoes:  text(),
  criadoEm:     timestamp("criado_em", { mode: 'string' }).defaultNow().notNull(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// MÓDULO DE COMPRAS — FASE 2: SC → COTAÇÃO → OC → FINANCEIRO
// ═══════════════════════════════════════════════════════════════════════════════

export const comprasSolicitacoes = pgTable("compras_solicitacoes", {
  id:               serial().primaryKey(),
  companyId:        integer("company_id").notNull(),
  numeroSc:         varchar("numero_sc", { length: 20 }).notNull(),
  obraId:           integer("obra_id"),
  projetoId:        integer("projeto_id"),
  solicitanteId:    integer("solicitante_id"),
  departamento:     varchar({ length: 100 }),
  titulo:           varchar({ length: 200 }),
  dataNecessidade:  varchar("data_necessidade", { length: 10 }),
  prioridade:       varchar({ length: 20 }).default("normal"),
  status:           varchar({ length: 30 }).notNull().default("rascunho"),
  aprovacaoStatus:  varchar("aprovacao_status", { length: 30 }).default("aguardando"),
  aprovadorId:      integer("aprovador_id"),
  aprovadoEm:       timestamp("aprovado_em", { mode: "string" }),
  observacoes:      text(),
  criadoEm:         timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  atualizadoEm:     timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
});

export const comprasSolicitacoesItens = pgTable("compras_solicitacoes_itens", {
  id:                 serial().primaryKey(),
  solicitacaoId:      integer("solicitacao_id").notNull(),
  descricao:          varchar({ length: 300 }).notNull(),
  unidade:            varchar({ length: 30 }),
  quantidade:         numeric({ precision: 10, scale: 3 }).notNull().default("1"),
  quantidadeAtendida: numeric("quantidade_atendida", { precision: 10, scale: 3 }).default("0"),
  statusItem:         varchar("status_item", { length: 30 }).default("pendente"),
  observacoes:        text(),
});

export const comprasCotacoes = pgTable("compras_cotacoes", {
  id:               serial().primaryKey(),
  companyId:        integer("company_id").notNull(),
  numeroCotacao:    varchar("numero_cotacao", { length: 20 }).notNull(),
  solicitacaoId:    integer("solicitacao_id"),
  obraId:           integer("obra_id"),
  fornecedorId:     integer("fornecedor_id"),
  descricao:        varchar({ length: 200 }),
  prioridade:       varchar({ length: 20 }).default("normal"),
  dataValidade:     varchar("data_validade", { length: 10 }),
  condicaoPagamento:varchar("condicao_pagamento", { length: 100 }),
  prazoEntregaDias: integer("prazo_entrega_dias"),
  status:           varchar({ length: 30 }).notNull().default("pendente"),
  observacoes:      text(),
  total:            numeric({ precision: 14, scale: 2 }).default("0"),
  criadoEm:         timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
});

export const comprasCotacoesItens = pgTable("compras_cotacoes_itens", {
  id:               serial().primaryKey(),
  cotacaoId:        integer("cotacao_id").notNull(),
  solicitacaoItemId:integer("solicitacao_item_id"),
  descricao:        varchar({ length: 300 }).notNull(),
  unidade:          varchar({ length: 30 }),
  quantidade:       numeric({ precision: 10, scale: 3 }).notNull().default("1"),
  precoUnitario:    numeric("preco_unitario", { precision: 14, scale: 4 }).default("0"),
  descontoPct:      numeric("desconto_pct", { precision: 5, scale: 2 }).default("0"),
  total:            numeric({ precision: 14, scale: 2 }).default("0"),
});

export const comprasOrdens = pgTable("compras_ordens", {
  id:                 serial().primaryKey(),
  companyId:          integer("company_id").notNull(),
  numeroOc:           varchar("numero_oc", { length: 20 }).notNull(),
  cotacaoId:          integer("cotacao_id"),
  obraId:             integer("obra_id"),
  fornecedorId:       integer("fornecedor_id"),
  solicitanteId:      integer("solicitante_id"),
  dataEntregaPrevista:varchar("data_entrega_prevista", { length: 10 }),
  dataEntregaReal:    varchar("data_entrega_real", { length: 10 }),
  status:             varchar({ length: 30 }).notNull().default("pendente"),
  aprovacaoStatus:    varchar("aprovacao_status", { length: 30 }).default("aguardando"),
  aprovadorId:        integer("aprovador_id"),
  subtotal:           numeric({ precision: 14, scale: 2 }).default("0"),
  frete:              numeric({ precision: 14, scale: 2 }).default("0"),
  outrasDespesas:     numeric("outras_despesas", { precision: 14, scale: 2 }).default("0"),
  impostos:           numeric({ precision: 14, scale: 2 }).default("0"),
  desconto:           numeric({ precision: 14, scale: 2 }).default("0"),
  total:              numeric({ precision: 14, scale: 2 }).default("0"),
  observacoes:        text(),
  criadoEm:           timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  atualizadoEm:       timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
});

export const comprasOrdensItens = pgTable("compras_ordens_itens", {
  id:               serial().primaryKey(),
  ordemId:          integer("ordem_id").notNull(),
  solicitacaoItemId:integer("solicitacao_item_id"),
  descricao:        varchar({ length: 300 }).notNull(),
  unidade:          varchar({ length: 30 }),
  quantidade:       numeric({ precision: 10, scale: 3 }).notNull().default("1"),
  quantidadeEntregue:numeric("quantidade_entregue", { precision: 10, scale: 3 }).default("0"),
  precoUnitario:    numeric("preco_unitario", { precision: 14, scale: 4 }).default("0"),
  total:            numeric({ precision: 14, scale: 2 }).default("0"),
});
