import { pgTable, pgSchema, AnyPgColumn, integer, serial, date, varchar, text, timestamp, smallint, index, uniqueIndex, numeric, json, jsonb, boolean, real, primaryKey } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const accidents = pgTable("accidents", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        obraId: integer("obra_id"),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataAcidente: date({ mode: 'string' }).notNull(),
        horaAcidente: varchar({ length: 10 }),
        tipoAcidente: text().notNull(),
        gravidade: text().notNull(),
        localAcidente: varchar({ length: 255 }),
        descricao: text(),
        parteCorpoAtingida: varchar({ length: 255 }),
        agenteCausador: varchar("agente_causador", { length: 255 }),
        catNumero: varchar({ length: 50 }),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        catData: date({ mode: 'string' }),
        houveCAT: smallint("houve_cat").default(0),
        motivoSemCAT: text("motivo_sem_cat"),
        diasAfastamento: integer().default(0),
        testemunhas: text(),
        acaoCorretiva: text(),
        statusAcaoCorretiva: varchar("status_acao_corretiva", { length: 50 }).default('Pendente'),
        prazoAcaoCorretiva: date("prazo_acao_corretiva", { mode: 'string' }),
        responsavelAcao: varchar("responsavel_acao", { length: 255 }),
        atestadoId: integer("atestado_id"),
        documentoUrl: text(),
        anexosUrls: text("anexos_urls"),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        deletedAt: timestamp("deleted_at", { mode: 'string' }),
        deletedBy: varchar("deleted_by", { length: 255 }),
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
        // Rev. 3117 — campos estruturados extraídos do laudo (Fase 2/IA, com revisão humana).
        aptoAltura: text(),
        aptoEspacoConfinado: text(),
        restricoes: text(),
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

// Rev. 3117 — Fila de EXTRAÇÃO POR IA dos PDFs de ASO (Fase 2). A IA lê o laudo
// e devolve campos estruturados que ficam em "aguardando_revisao" até um humano
// aprovar (jamais grava laudo médico automaticamente). Colunas snake_case
// (criadas via self-heal [SyncSchema+]).
export const asoExtracaoIa = pgTable("aso_extracao_ia", {
        id: serial("id").primaryKey().notNull(),
        asoId: integer("aso_id").notNull(),
        companyId: integer("company_id").notNull(),
        employeeId: integer("employee_id").notNull(),
        status: varchar("status", { length: 30 }).default('aguardando_revisao').notNull(),
        extracaoBrutaJson: text("extracao_bruta_json"),
        resultado: varchar("resultado", { length: 50 }),
        aptoAltura: varchar("apto_altura", { length: 60 }),
        aptoEspacoConfinado: varchar("apto_espaco_confinado", { length: 60 }),
        restricoes: text("restricoes"),
        fatoresRisco: text("fatores_risco"),
        examesDetectadosJson: text("exames_detectados_json"),
        confianca: integer("confianca"),
        erroMsg: text("erro_msg"),
        modelo: varchar("modelo", { length: 60 }),
        revisadoPor: varchar("revisado_por", { length: 255 }),
        revisadoPorUserId: integer("revisado_por_user_id"),
        revisadoEm: timestamp("revisado_em", { mode: 'string' }),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("idx_aso_extr_company").on(table.companyId),
        index("idx_aso_extr_aso").on(table.asoId),
        index("idx_aso_extr_status").on(table.companyId, table.status),
]);

export const atestados = pgTable("atestados", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        tipo: varchar({ length: 100 }).notNull(),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataEmissao: date({ mode: 'string' }).notNull(),
        diasAfastamento: integer().default(0),
        horasAfastamento: numeric("horas_afastamento", { precision: 5, scale: 2 }).default("0").$type<number>(),
        afastamentoTipo: varchar("afastamento_tipo", { length: 20 }).default("dia"),
        afastamentoINSS: smallint("afastamento_inss").default(0),
        statusAlterado: smallint("status_alterado").default(0),
        statusAnterior: varchar("status_anterior", { length: 50 }),
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

export const userActivityLog = pgTable("user_activity_log", {
        id: serial().primaryKey().notNull(),
        companyId: integer("company_id").notNull(),
        userId: integer("user_id").notNull(),
        userName: varchar("user_name", { length: 255 }),
        tipo: varchar({ length: 20 }).notNull(),
        pagina: varchar({ length: 500 }).notNull(),
        acao: varchar({ length: 500 }),
        modulo: varchar({ length: 100 }),
        detalhes: text(),
        duracaoSegundos: integer("duracao_segundos"),
        criadoEm: timestamp("criado_em", { mode: 'string' }).defaultNow().notNull(),
});

export const iaModuloConversas = pgTable("ia_modulo_conversas", {
        id: serial().primaryKey().notNull(),
        companyId: integer("company_id").notNull(),
        userId: integer("user_id").notNull(),
        userName: varchar("user_name", { length: 255 }),
        modulo: varchar({ length: 100 }).notNull(),
        pergunta: text().notNull(),
        resposta: text(),
        projetoId: integer("projeto_id"),
        criadoEm: timestamp("criado_em", { mode: 'string' }).defaultNow().notNull(),
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

// Recontratação (Rev. 2755) — fila de solicitações em STAGING. Nada vira funcionário até a liberação do sócio.
// A ficha completa do candidato fica em `fichaJson` (NÃO grava em employees enquanto pendente).
export const recontratacaoSolicitacoes = pgTable("recontratacao_solicitacoes", {
        id: serial().notNull(),
        companyId: integer("company_id").notNull(),
        cpf: varchar({ length: 14 }).notNull(),
        nomeCompleto: varchar("nome_completo", { length: 255 }).notNull(),
        funcao: varchar({ length: 255 }),
        // Vínculo anterior (registro desligado que originou a recontratação)
        vinculoAnteriorEmployeeId: integer("vinculo_anterior_employee_id"),
        vinculoAnteriorCompanyId: integer("vinculo_anterior_company_id"),
        vinculoAnteriorCodigo: varchar("vinculo_anterior_codigo", { length: 30 }),
        vinculoAnteriorFuncao: varchar("vinculo_anterior_funcao", { length: 255 }),
        vinculoAnteriorDesligamento: varchar("vinculo_anterior_desligamento", { length: 30 }),
        mesmaEmpresa: smallint("mesma_empresa").default(1).notNull(),
        mesmaFuncao: smallint("mesma_funcao").default(0).notNull(),
        diasFora: integer("dias_fora"),
        // Sinalizações jurídicas computadas no momento da solicitação (snapshot)
        experienciaPermitida: smallint("experiencia_permitida").default(1).notNull(),
        alertaJuridico: text("alerta_juridico"),
        carenciaDias: integer("carencia_dias"),
        dentroCarencia: smallint("dentro_carencia").default(0).notNull(),
        // Ficha completa do candidato + blocos copiados (JSON serializado)
        fichaJson: text("ficha_json").notNull(),
        blocosCopiados: text("blocos_copiados"),
        // Workflow de liberação
        status: text().default('pendente').notNull(), // pendente | aprovada | recusada | vencida
        prazoLimite: timestamp("prazo_limite", { mode: 'string' }),
        solicitadoPor: varchar("solicitado_por", { length: 255 }).notNull(),
        solicitadoPorId: integer("solicitado_por_id").notNull(),
        observacaoSolicitante: text("observacao_solicitante"),
        // Resolução
        resolvidoPor: varchar("resolvido_por", { length: 255 }),
        resolvidoPorId: integer("resolvido_por_id"),
        resolvidoData: timestamp("resolvido_data", { mode: 'string' }),
        parecer: text(),
        // Funcionário criado quando aprovada
        employeeCriadoId: integer("employee_criado_id"),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("recon_company").on(table.companyId),
        index("recon_status").on(table.companyId, table.status),
        index("recon_cpf").on(table.cpf),
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

// ── CIPA · Eleição digital + Planos de ação (Rev. 3041) ───────────────────
// Colunas snake_case EXPLÍCITAS para casar com o self-heal CREATE TABLE.
export const cipaCandidates = pgTable("cipa_candidates", {
        id: serial().notNull(),
        companyId: integer("company_id").notNull(),
        electionId: integer("election_id").notNull(),
        employeeId: integer("employee_id").notNull(),
        numero: integer(),
        proposta: text(),
        fotoUrl: text("foto_url"),
        status: text().default('inscrito').notNull(), // inscrito | deferido | indeferido
        votosCache: integer("votos_cache").default(0).notNull(),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("ccand_election").on(table.electionId),
        index("ccand_company").on(table.companyId),
]);

export const cipaVoters = pgTable("cipa_voters", {
        id: serial().notNull(),
        companyId: integer("company_id").notNull(),
        electionId: integer("election_id").notNull(),
        employeeId: integer("employee_id").notNull(),
        token: varchar({ length: 64 }).notNull(),
        jaVotou: smallint("ja_votou").default(0).notNull(),
        votouEm: timestamp("votou_em", { mode: 'string' }),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        uniqueIndex("cvoter_token").on(table.token),
        index("cvoter_election").on(table.electionId),
]);

// Voto ANÔNIMO — NÃO referencia o eleitor (sigilo do voto).
export const cipaVotes = pgTable("cipa_votes", {
        id: serial().notNull(),
        companyId: integer("company_id").notNull(),
        electionId: integer("election_id").notNull(),
        candidateId: integer("candidate_id").notNull(),
        votadoEm: timestamp("votado_em", { mode: 'string' }).defaultNow().notNull(),
        ip: varchar({ length: 60 }),
},
(table) => [
        index("cvote_election").on(table.electionId),
        index("cvote_candidate").on(table.candidateId),
]);

export const cipaActionItems = pgTable("cipa_action_items", {
        id: serial().notNull(),
        companyId: integer("company_id").notNull(),
        mandateId: integer("mandate_id").notNull(),
        meetingId: integer("meeting_id"),
        descricao: text().notNull(),
        responsavel: varchar({ length: 255 }),
        prazo: date({ mode: 'string' }),
        prioridade: text().default('media').notNull(), // baixa | media | alta
        status: text().default('pendente').notNull(), // pendente | em_andamento | concluido
        dataConclusao: date("data_conclusao", { mode: 'string' }),
        evidencia: text(),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("cai_mandate").on(table.mandateId),
        index("cai_company").on(table.companyId),
]);

// ============================================================
// SAAS BILLING (Stripe) — Rev. 4042
// companySubscriptions: 1 linha por empresa-cliente com assinatura Stripe.
// companySubscriptionModules: módulos contratados na assinatura (histórico
// imutável do priceId usado no momento da contratação/alteração).
// ============================================================
export const companySubscriptions = pgTable("company_subscriptions", {
        id: serial().notNull(),
        companyId: integer("company_id").notNull(),
        stripeCustomerId: varchar("stripe_customer_id", { length: 255 }).notNull(),
        stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }).notNull(),
        status: varchar({ length: 30 }).default('trialing').notNull(), // trialing|active|past_due|canceled|unpaid
        seats: integer().default(1).notNull(),
        trialEnd: timestamp("trial_end", { mode: 'string' }),
        currentPeriodEnd: timestamp("current_period_end", { mode: 'string' }),
        canceledAt: timestamp("canceled_at", { mode: 'string' }),
        paymentFailedAt: timestamp("payment_failed_at", { mode: 'string' }),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const companySubscriptionModules = pgTable("company_subscription_modules", {
        id: serial().notNull(),
        subscriptionId: integer("subscription_id").notNull(),
        moduleId: varchar("module_id", { length: 60 }).notNull(),
        stripePriceId: varchar("stripe_price_id", { length: 255 }),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

// Rev. 4047 — override editável (admin_master) do preço de catálogo por módulo/assento.
// Fonte de VERDADE do valor exibido em getCatalog(); ausência de linha = usa o default
// estático de shared/billingModules.ts. moduleId="seat" cobre o preço por usuário.
export const billingModulePrices = pgTable("billing_module_prices", {
        id: serial().notNull(),
        moduleId: varchar("module_id", { length: 60 }).notNull(),
        monthlyPriceCents: integer("monthly_price_cents").notNull(),
        // Rev. 4059 — liga/desliga o módulo para NOVAS contratações/upgrades (venda).
        // Assinaturas já ativas com o módulo continuam com acesso normal mesmo se
        // desativado depois; 1=à venda (default), 0=fora de venda.
        isActive: integer("is_active").default(1).notNull(),
        updatedByName: varchar("updated_by_name", { length: 255 }),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
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
        docRodapeTexto: text("doc_rodape_texto"),
        docMarcaDaguaUrl: text("doc_marca_dagua_url"),
        docMarcaDaguaOpacidade: numeric("doc_marca_dagua_opacidade", { precision: 3, scale: 2 }).default("0.08"),
        heDestinoPadrao: text("heDestinoPadrao").default("banco_horas"),
        gestorFinanceiroId: integer("gestor_financeiro_id"),
        gestorFinanceiroNome: varchar("gestor_financeiro_nome", { length: 255 }),
        gestorProjetoId: integer("gestor_projeto_id"),
        gestorProjetoNome: varchar("gestor_projeto_nome", { length: 255 }),
        // Rev. 2400 — Toggle global de auditoria do Almoxarifado.
        // Ambos default 1 (preserva comportamento da Rev. 2388).
        almoxarifadoExigeSenha: smallint("almoxarifado_exige_senha").default(1).notNull(),
        almoxarifadoExigeJustificativa: smallint("almoxarifado_exige_justificativa").default(1).notNull(),
        // Rev. 2462 — Independente dos toggles de senha/justificativa, a
        // empresa pode dispensar a APROVAÇÃO do gestor: o evento ainda é
        // logado (user, hora, IP, antes/depois) mas entra direto como
        // `validado` (não vira pendência). Default 1 = aprovação exigida
        // (preserva comportamento das Revs. 2388–2461).
        almoxarifadoExigeAprovacao: smallint("almoxarifado_exige_aprovacao").default(1).notNull(),
        // Rev. 2905 — Toggle global do banner "Instalar no celular" (PWA).
        // Default 1 preserva comportamento da Rev. 2904 (banner aparece).
        // 0 = esconde o banner em todos os dispositivos. NÃO afeta o uso
        // offline do Levantamento de Campo (que independe da instalação).
        pwaInstallBannerAtivo: smallint("pwa_install_banner_ativo").default(1).notNull(),
        // Rev. 2914 — Necessidade de EPI/Uniforme por funcionário (configurável por tipo).
        // Quantidade que CADA funcionário ativo precisa de cada item; usada no
        // cruzamento "Necessidade x Estoque". Default 1 (1 camisa, 1 calça, 1 calçado).
        epiNecCamisa: smallint("epi_nec_camisa").default(1).notNull(),
        epiNecCalca: smallint("epi_nec_calca").default(1).notNull(),
        epiNecCalcado: smallint("epi_nec_calcado").default(1).notNull(),
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
        convenio: varchar({ length: 30 }),
        usarParaFolha: smallint("usarParaFolha").default(0),
        temTalao: smallint("temTalao").default(0),
        temAplicacaoAutomatica: smallint("temAplicacaoAutomatica").default(0),
        // Rev. 3398 — Conta Caixa (sem extrato bancário): recebimentos em dinheiro/cheques
        // de terceiros, pagamentos informais etc. Na Conciliação o modo muda: não importa
        // extrato OFX/CSV; o usuário confirma manualmente cada entrada/saída registrada no ERP.
        caixaInterno: smallint("caixaInterno").default(0),
        // Rev. 3384 — Contatos da agência (gerente + endereço/telefone da agência).
        nomeGerente: varchar("nome_gerente", { length: 150 }),
        telefoneGerente: varchar("telefone_gerente", { length: 30 }),
        emailGerente: varchar("email_gerente", { length: 150 }),
        enderecoAgencia: varchar("endereco_agencia", { length: 300 }),
        telefoneAgencia: varchar("telefone_agencia", { length: 30 }),
        // Rev. 3876 — Cheque especial: flag de controle (liga/desliga alerta) + limite disponível.
        chequeEspecialAtivo: smallint("cheque_especial_ativo").default(0),
        chequeEspecialLimite: numeric("cheque_especial_limite", { precision: 15, scale: 2 }).default("0"),
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

// Talões de cheque por conta bancária (Rev. 3343) — rastreabilidade de folhas.
// Cada talão tem nº do cheque inicial + qtd de folhas; numeroFinal é derivado/gravado.
// folhasStatusJson guarda só as EXCEÇÕES por folha ({"125":"perdida","130":"cancelada"});
// folha "usada" é derivada cruzando financial_cheques.numero_cheque; o resto é "disponível".
export const financialChequeTaloes = pgTable("financial_cheque_taloes", {
        id: serial().notNull(),
        companyId: integer("company_id").notNull(),
        contaBancariaId: integer("conta_bancaria_id").notNull(),
        descricao: varchar({ length: 120 }),
        numeroInicial: integer("numero_inicial").notNull(),
        quantidadeFolhas: integer("quantidade_folhas").notNull(),
        numeroFinal: integer("numero_final").notNull(),
        status: text().default('ativo').notNull(),
        folhasStatusJson: text("folhas_status_json"),
        observacao: text(),
        createdByUserId: integer("created_by_user_id"),
        createdByName: varchar("created_by_name", { length: 255 }),
        excluidoEm: timestamp("excluido_em", { mode: 'string' }),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("fct_company").on(table.companyId),
        index("fct_conta").on(table.contaBancariaId),
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
        // Rev. 3278 — DIFERENÇA SALARIAL retroativa do dissídio (vigência no passado).
        diferencaMesPagamento: varchar("diferenca_mes_pagamento", { length: 7 }),
        diferencaBaseVerbas: varchar("diferenca_base_verbas", { length: 20 }),
        diferencaBreakdownJson: json("diferenca_breakdown_json"),
        diferencaTipo: text("diferenca_tipo"),
        // Rev. 3993 — override manual da diferença retroativa (bruto/inss/irrf/liquido).
        diferencaOverrideJson: json("diferenca_override_json"),
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
        // Rev. 3278 — DATA DE VIGÊNCIA do acordo (a partir de quando o reajuste vale).
        // Meses entre a vigência e a aplicação geram DIFERENÇA SALARIAL retroativa.
        dataVigencia: date("data_vigencia", { mode: 'string' }),
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

// ============================================================
// CONVENÇÃO COLETIVA COM IA (Rev. 2551) — análise por IA do PDF da CCT/circular
// e aplicação em massa de reajuste salarial (via dissídio) + benefícios.
// ============================================================
export const convencaoAnalises = pgTable("convencao_analises", {
        id: serial().notNull(),
        companyId: integer("company_id").notNull(),
        anoReferencia: integer("ano_referencia").notNull(),
        documentoUrl: text("documento_url"),
        documentoNome: varchar("documento_nome", { length: 255 }),
        // JSON bruto retornado pela IA
        extracaoBrutaJson: text("extracao_bruta_json"),
        // JSON normalizado/revisado pelo usuário antes de aplicar
        extracaoRevisadaJson: text("extracao_revisada_json"),
        // processando | analisado | aplicado | erro
        status: text().default('processando').notNull(),
        erroMensagem: text("erro_mensagem"),
        // metadados rápidos pra listagem
        sindicato: varchar({ length: 255 }),
        numeroCct: varchar("numero_cct", { length: 100 }),
        percentualReajuste: varchar("percentual_reajuste", { length: 10 }),
        pisoSalarial: varchar("piso_salarial", { length: 20 }),
        // vínculo com o dissídio criado na aplicação (salário)
        dissidioId: integer("dissidio_id"),
        criadoPor: varchar("criado_por", { length: 255 }),
        criadoPorUserId: integer("criado_por_user_id"),
        aplicadoPor: varchar("aplicado_por", { length: 255 }),
        aplicadoEm: timestamp("aplicado_em", { mode: 'string' }),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("ca_company_ano").on(table.companyId, table.anoReferencia),
        index("ca_status").on(table.companyId, table.status),
]);

export const convencaoAnaliseItens = pgTable("convencao_analise_itens", {
        id: serial().notNull(),
        analiseId: integer("analise_id").notNull(),
        companyId: integer("company_id").notNull(),
        employeeId: integer("employee_id").notNull(),
        // salario | va | vr | vt | seguroVida | auxFarmacia
        campo: varchar({ length: 30 }).notNull(),
        valorAnterior: varchar("valor_anterior", { length: 30 }),
        valorNovo: varchar("valor_novo", { length: 30 }),
        aplicadoEm: timestamp("aplicado_em", { mode: 'string' }),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("cai_analise").on(table.analiseId),
        index("cai_employee").on(table.employeeId),
        index("cai_company").on(table.companyId),
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
        tipoRemuneracao: varchar({ length: 20 }).default('horista'),
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
        // Rev. 2854 — Tamanhos de EPI/uniforme (mapeamento de compra + estoque)
        tamanhoCalcado: varchar({ length: 10 }),
        tamanhoCamisa: varchar({ length: 10 }),
        tamanhoCalca: varchar({ length: 10 }),
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
        // Rev. 3022 — pré-marcação "NÃO RENOVAR": RH demarca antecipadamente que
        // o contrato de experiência NÃO será prorrogado/efetivado (haverá aviso de
        // não renovação). É só um flag de intenção (reversível) — não muda status.
        experienciaNaoRenovar: smallint().default(0),
        experienciaNaoRenovarEm: date({ mode: 'string' }),
        experienciaNaoRenovarPor: varchar({ length: 255 }),
        // Rev. 2125 — número do Contrato de Experiência alocado uma única vez
        // e persistido (formato exibido NNN/AAAA). Counter atômico em
        // `contract_counters(company_id, ano, tipo='contrato_experiencia')`.
        numeroContratoExperiencia: integer("numero_contrato_experiencia"),
        numeroContratoExperienciaAno: integer("numero_contrato_experiencia_ano"),
        vtTipo: text(),
        vtValorDiario: varchar({ length: 20 }),
        vtOperadora: varchar({ length: 100 }),
        vtLinhas: varchar({ length: 255 }),
        vtDescontoFolha: varchar({ length: 20 }),
        dependentesIR: smallint("dependentes_ir").default(0),
        pensaoAlimenticia: smallint().default(0),
        pensaoValor: varchar({ length: 20 }),
        pensaoTipo: text(),
        pensaoPercentual: varchar({ length: 10 }),
        pensaoBase: text().default("salario_bruto"),
        pensaoIncideFerias: boolean().default(true),
        pensaoIncideDecimoTerceiro: boolean().default(true),
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
        // Rev. 3977 — Banco de Horas: exceção BIDIRECIONAL por funcionário (crédito E débito).
        // Quando =1, o funcionário NUNCA usa banco de horas (nem para HE excedente, nem para
        // atraso/falta), seguindo sempre o padrão de pagamento — independente do parâmetro
        // mestre da empresa (he_banco_horas / companies.heDestinoPadrao).
        bancoHorasExcecao: smallint("banco_horas_excecao").default(0).notNull(),
        cargoConfianca: smallint("cargo_confianca").default(0).notNull(),
        cargoConfiancaDesde: date("cargo_confianca_desde", { mode: "string" }),
        cargoConfiancaGratificacao: varchar("cargo_confianca_gratificacao", { length: 20 }),
        // Rev. 1874 — CLT Art. 62: inciso (I=externo, II=gestão, III=teletrabalho produção) + observação/justificativa (obrigatória inciso I — anotação CTPS).
        cargoConfiancaInciso: varchar("cargo_confianca_inciso", { length: 5 }),
        cargoConfiancaObservacao: text("cargo_confianca_observacao"),
        // Rev. 1878 — Termo formal de isenção (Art. 62 CLT) assinado pelo colaborador
        cargoConfiancaTermoUrl: text("cargo_confianca_termo_url"),
        cargoConfiancaTermoNomeArquivo: text("cargo_confianca_termo_nome_arquivo"),
        cargoConfiancaTermoAssinadoEm: timestamp("cargo_confianca_termo_assinado_em", { mode: "string" }),
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
        assinaturaMemorial: text("assinatura_memorial"),
        assinaturaMemorialAt: timestamp("assinatura_memorial_at", { mode: "string" }),
        // Recontratação (Rev. 2755) — vínculo do funcionário NOVO com o registro ANTERIOR (mesmo CPF).
        // O registro antigo permanece intacto, encerrado no desligamento; o novo ganha ficha/timeline própria.
        recontratadoDeEmployeeId: integer("recontratado_de_employee_id"),
        recontratadoDeCompanyId: integer("recontratado_de_company_id"),
        recontratadoData: timestamp("recontratado_data", { mode: "string" }),
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
        assinaturaResponsavelUrl: text("assinatura_responsavel_url"),
        assinaturaResponsavelNome: varchar("assinatura_responsavel_nome", { length: 255 }),
        assinaturaResponsavelEm: timestamp("assinatura_responsavel_em", { mode: 'string' }),
        biometriaFacialUrl: text("biometria_facial_url"),
        biometriaCapturadaEm: timestamp("biometria_capturada_em", { mode: 'string' }),
        modoIdentificacao: varchar("modo_identificacao", { length: 20 }).default('manual'),
        grupoEntregaId: varchar("grupo_entrega_id", { length: 36 }),
        foraDoKit: smallint("fora_do_kit").default(0).notNull(),
},
(table) => [
        index("idx_ed_company").on(table.companyId),
        index("idx_ed_employee").on(table.employeeId),
        index("idx_ed_epi").on(table.epiId),
        index("idx_ed_origem").on(table.origemEntrega),
        index("idx_ed_obra").on(table.obraId),
]);

// Rev. 3888 — Catálogo gerenciado de motivos de entrega (admin-only write)
export const epiMotivos = pgTable("epi_motivos", {
  id: serial().primaryKey(),
  nome: varchar({ length: 255 }).notNull(),
  ativo: integer().default(1).notNull(),
  ordem: integer().default(0).notNull(),
  createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

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
        fotoUrl: text("fotoUrl"),
});

// Estoque de EPI por Obra
export const epiEstoqueObra = pgTable("epi_estoque_obra", {
        id: serial().primaryKey().notNull(),
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
        // Rev. 3352 — observado: a empresa ADOTA (segue) este feriado? 1=sim (jornada
        // esperada=0 → HE 100% no dia), 0=não (dia normal). Obrigatórios nascem 1;
        // facultativos (Carnaval/Corpus/ponto_facultativo) nascem 0 (empresa decide se segue).
        observado: smallint().default(1).notNull(),
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

// Rev. 2195: Encargos Sociais sobre Folha — upload e conferência de
// guias DCTFWeb (DARF unificada INSS/IRRF/Terceiros) e FGTS Digital
// que a contabilidade terceirizada envia mensalmente.
export const encargosSociaisDocumentos = pgTable("encargos_sociais_documentos", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        competencia: varchar({ length: 7 }).notNull(), // YYYY-MM
        tipo: varchar({ length: 30 }).notNull(), // 'dctfweb' | 'fgts' | 'outro'
        numeroDocumento: varchar({ length: 60 }),
        dataVencimento: varchar({ length: 10 }), // DD/MM/YYYY ou YYYY-MM-DD
        valorTotal: varchar({ length: 20 }).notNull().default('0'),
        pdfUrl: text().notNull(),
        pdfFileName: varchar({ length: 255 }),
        itensJson: text(), // JSON array: [{ codigo, denominacao, principal, multa, juros, total, observacao }]
        status: varchar({ length: 30 }).default('importado').notNull(), // 'importado' | 'validado' | 'enviado_financeiro' | 'pago'
        uploadedPor: varchar({ length: 255 }),
        uploadedEm: timestamp({ mode: 'string' }).defaultNow(),
        validadoPor: varchar({ length: 255 }),
        validadoEm: timestamp({ mode: 'string' }),
        enviadoFinanceiroPor: varchar({ length: 255 }),
        enviadoFinanceiroEm: timestamp({ mode: 'string' }),
        observacoes: text(),
        deletedAt: timestamp({ mode: 'string' }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("encargos_sociais_company_comp").on(table.companyId, table.competencia),
        index("encargos_sociais_tipo").on(table.tipo),
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
        planejamentoAtividadeId: integer("planejamento_atividade_id"),
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

export const heSolicitacaoAtividades = pgTable("he_solicitacao_atividades", {
        id: serial().notNull(),
        solicitacaoId: integer("solicitacao_id").notNull(),
        atividadeId: integer("atividade_id").notNull(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("he_sol_atv_sol").on(table.solicitacaoId),
        index("he_sol_atv_atv").on(table.atividadeId),
]);

// ── HE CONFIRMAÇÕES DE PRESENÇA — Rev.1070 ──────────────────────────────────
export const heSolicitacaoConfirmacoes = pgTable("he_solicitacao_confirmacoes", {
  id: serial().primaryKey(),
  solicitacaoId: integer("solicitacao_id").notNull(),
  employeeId: integer("employee_id").notNull(),
  assinaturaUrl: text("assinatura_url"),
  confirmedAt: timestamp("confirmed_at", { mode: "string" }).defaultNow().notNull(),
  ipAddress: varchar("ip_address", { length: 50 }),
  compareceu: boolean().default(null),
  registradoPor: varchar("registrado_por", { length: 255 }),
  registradoEm: timestamp("registrado_em", { mode: "string" }),
  observacao: text(),
  assinaturaDivergente: boolean("assinatura_divergente").default(false),
  similaridade: numeric("similaridade", { precision: 5, scale: 2 }),
  provaAlternativa: text("prova_alternativa"),
  provaAlternativaTipo: varchar("prova_alternativa_tipo", { length: 20 }),
  provaAlternativaPor: varchar("prova_alternativa_por", { length: 255 }),
  provaAlternativaEm: timestamp("prova_alternativa_em", { mode: "string" }),
},
(table) => [
  index("he_conf_sol").on(table.solicitacaoId),
  index("he_conf_emp").on(table.employeeId),
]);

// ── HE PERIODS — Rev.646 ─────────────────────────────────────────────────────
export const hePeriods = pgTable("he_periods", {
  id:                serial().primaryKey(),
  companyId:         integer("companyId").notNull(),
  mesReferencia:     text("mesReferencia").notNull(),
  dataInicio:        date("dataInicio", { mode: "string" }).notNull(),
  dataFim:           date("dataFim", { mode: "string" }).notNull(),
  status:            text().notNull().default("calculado"),
  totalFuncionarios: integer("totalFuncionarios").default(0),
  totalHEMins:       integer("totalHEMins").default(0),
  totalValorHE:      numeric("totalValorHE", { precision: 15, scale: 2 }).default("0"),
  criadoPor:         text("criadoPor"),
  aprovadoPor:       text("aprovadoPor"),
  aprovadoEm:        timestamp("aprovadoEm"),
  pagoPor:           text("pagoPor"),
  pagoEm:            timestamp("pagoEm"),
  criadoEm:          timestamp("criadoEm").defaultNow(),
}, (t) => [
  index("he_periods_company").on(t.companyId),
  index("he_periods_mes").on(t.mesReferencia),
  index("he_periods_status").on(t.status),
]);

export const hePeriodEmployees = pgTable("he_period_employees", {
  id:           serial().primaryKey(),
  hePeriodId:   integer("hePeriodId").notNull(),
  companyId:    integer("companyId").notNull(),
  employeeId:   integer("employeeId").notNull(),
  nome:         text(),
  heUtilMins:   integer("heUtilMins").default(0),
  heFimMins:    integer("heFimMins").default(0),
  heTotalMins:  integer("heTotalMins").default(0),
  valorHEUtil:  numeric("valorHEUtil",  { precision: 15, scale: 2 }).default("0"),
  valorHEFim:   numeric("valorHEFim",   { precision: 15, scale: 2 }).default("0"),
  valorHETotal: numeric("valorHETotal", { precision: 15, scale: 2 }).default("0"),
  salarioBruto: numeric("salarioBruto", { precision: 15, scale: 2 }).default("0"),
  valorHora:    numeric("valorHora",    { precision: 15, scale: 4 }).default("0"),
  destinacao:   text().default("pagamento"),
  // Rev. 2179 — origem do bloco de HE: "aprovada" (existe solicitação HE aprovada
  // cobrindo o dia) ou "sem_solicitacao". Permite até 2 linhas por funcionário
  // por período (uma de cada origem) com destinacao (Pagar/Banco) independente.
  origem:       text().default("sem_solicitacao"),
}, (t) => [
  index("he_pe_period").on(t.hePeriodId),
  index("he_pe_emp").on(t.employeeId),
  index("he_pe_company").on(t.companyId),
]);

export const bancoHorasSaldo = pgTable("banco_horas_saldo", {
  employeeId:   integer("employeeId").notNull(),
  companyId:    integer("companyId").notNull(),
  saldoMinutos: integer("saldoMinutos").notNull().default(0),
  atualizadoEm: timestamp("atualizadoEm").defaultNow(),
}, (t) => [
  // composite PK (employeeId, companyId) — enforced at DB level via PRIMARY KEY
]);

export const bancoHorasLancamentos = pgTable("banco_horas_lancamentos", {
  id:          serial().primaryKey(),
  employeeId:  integer("employeeId").notNull(),
  companyId:   integer("companyId").notNull(),
  hePeriodId:  integer("hePeriodId"),
  tipo:        text().notNull(),
  minutos:     integer().notNull(),
  minutosBase: integer("minutosBase").default(0),
  minutosAcrescimo: integer("minutosAcrescimo").default(0),
  descricao:   text().notNull(),
  data:        date({ mode: "string" }).notNull(),
  criadoPor:   text("criadoPor"),
  criadoEm:    timestamp("criadoEm").defaultNow(),
}, (t) => [
  index("bhl_emp").on(t.employeeId),
  index("bhl_company").on(t.companyId),
  index("bhl_data").on(t.data),
]);

// Rev. 4133 — timeline de vigência do regime de Banco de Horas x Pagamento de Hora Extra.
// Cada linha é um marco: a partir de `dataInicio`, o regime `regime` passou a valer para a empresa.
// Quando `zerouSaldos=true`, essa vigência também disparou o zeramento de saldo anterior a `dataInicio`
// (histórico de horas anteriores já foi pago/descontado por outra via, então não deve contar no saldo).
export const bancoHorasVigencias = pgTable("banco_horas_vigencias", {
  id:            serial().primaryKey(),
  companyId:     integer("companyId").notNull(),
  regime:        text().notNull(), // 'banco_horas' | 'pagamento_horas_extras'
  dataInicio:    date("dataInicio", { mode: "string" }).notNull(),
  zerouSaldos:   integer("zerouSaldos").default(0), // 0/1 — se este marco zerou saldos anteriores
  observacao:    text(),
  criadoPor:     text("criadoPor"),
  criadoEm:      timestamp("criadoEm").defaultNow(),
}, (t) => [
  index("bhv_company").on(t.companyId),
  index("bhv_data").on(t.dataInicio),
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
        categoriaMO: varchar("categoria_mo", { length: 30 }), // 'direto' | 'indireta_obra' | 'escritorio_central'
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
        descontoVaPercentual: varchar({ length: 10 }).default('0'),
        cafeTotalMes: varchar("cafe_total_mes", { length: 20 }).default('0'),
        lancheTotalMes: varchar("lanche_total_mes", { length: 20 }).default('0'),
        jantaTotalMes: varchar("janta_total_mes", { length: 20 }).default('0'),
        vaTotalMes: varchar("va_total_mes", { length: 20 }).default('0'),
        vigenciaInicio: date("vigencia_inicio"),
        vigenciaFim: date("vigencia_fim"),
},
(table) => [
        index("idx_meal_company").on(table.companyId),
        index("idx_meal_obra").on(table.obraId),
        index("idx_meal_vigencia").on(table.companyId, table.obraId, table.vigenciaInicio),
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

export const menuLayoutGlobal = pgTable("menu_layout_global", {
        id: integer().notNull(),
        layoutJson: text("layout_json").notNull(),
        updatedBy: integer("updated_by"),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

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

// Rev. 1271 — Tracking per-user "last seen" timestamp for badge dot notifications
// (ex.: bolinha vermelha em "Solicitação de HE" / "Solicitação de MO" no menu).
// PK composta (userId, notificationKey).
export const notificationViews = pgTable("notification_views", {
        userId: integer("user_id").notNull(),
        notificationKey: varchar("notification_key", { length: 100 }).notNull(),
        lastViewedAt: timestamp("last_viewed_at", { mode: 'string' }).defaultNow().notNull(),
}, (t) => [
        primaryKey({ columns: [t.userId, t.notificationKey] }),
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
        insalubridadeOverride: varchar("insalubridade_override", { length: 20 }).default('herda'),
        periculosidadeOverride: varchar("periculosidade_override", { length: 10 }).default('herda'),
        adicionalEscolhido: varchar("adicional_escolhido", { length: 20 }).default('auto'),
});

// Rev. 2858 — COLETA DE CAMPO (RH): link externo por obra (token+QR, sem login)
// para auxiliar de campo coletar/atualizar dados dos funcionários alocados pelo
// celular. Toda resposta entra numa FILA DE REVISÃO e só grava na ficha do
// employee após o RH aprovar. Tabelas 100% aditivas (nenhuma coluna nova em
// employees — todas já existem).
export const coletaRhSessoes = pgTable("coleta_rh_sessoes", {
        id: serial().notNull(),
        companyId: integer("company_id").notNull(),
        obraId: integer("obra_id").notNull(),
        token: varchar({ length: 64 }).notNull(),
        titulo: varchar({ length: 255 }),
        ativo: smallint().default(1).notNull(),
        // Rev. 2865 — JSON array de chaves de grupo a coletar (foto/epi/contato/
        // emergencia/endereco). NULL = todos (backward compat). Ver shared/coletaCampos.ts.
        camposJson: text("campos_json"),
        // Rev. 2887 — itens EXTRAS por link: JSON array de {campo,label} apontando
        // p/ campos de employees (catálogo em shared/coletaCampos.ts). NULL = sem
        // itens extras. Gravado AUTOMÁTICO na ficha na aprovação.
        itensCustomJson: text("itens_custom_json"),
        criadoPor: varchar("criado_por", { length: 255 }),
        criadoPorId: integer("criado_por_id"),
        expiraEm: timestamp("expira_em", { mode: 'string' }),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
        // Rev. 2868 — soft-delete (excluir link sem DELETE físico; R-001/R-007/R-010).
        // NULL = ativo/visível; preenchido = excluído (sai das listas e invalida o link).
        deletedAt: timestamp("deleted_at", { mode: 'string' }),
});

export const coletaRhRespostas = pgTable("coleta_rh_respostas", {
        id: serial().notNull(),
        companyId: integer("company_id").notNull(),
        sessaoId: integer("sessao_id").notNull(),
        obraId: integer("obra_id").notNull(),
        employeeId: integer("employee_id").notNull(),
        status: text().default('pendente').notNull(), // pendente | aprovada | rejeitada
        dadosJson: text("dados_json").notNull(),
        fotoUrl: text("foto_url"),
        enviadoPor: varchar("enviado_por", { length: 255 }),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
        revisadoPor: varchar("revisado_por", { length: 255 }),
        revisadoPorId: integer("revisado_por_id"),
        revisadoEm: timestamp("revisado_em", { mode: 'string' }),
        motivoRejeicao: text("motivo_rejeicao"),
        deletedAt: timestamp("deleted_at", { mode: 'string' }),
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
        responsavelId: integer("responsavel_id"),
        insalubridadeGrau: varchar("insalubridade_grau", { length: 20 }).default('none'),
        periculosidade: smallint().default(0),
        adicionalNoturnoAtivo: smallint("adicional_noturno_ativo").default(0),
        condicoesVigenciaInicio: date("condicoes_vigencia_inicio", { mode: 'string' }),
        gerenciadoraNome: varchar("gerenciadora_nome", { length: 255 }),
        gerenciadoraLogoUrl: text("gerenciadora_logo_url"),
        clienteLogoUrl: text("cliente_logo_url"),
        // Rev. 2879 — quais dos 3 logos aparecem no cabeçalho das fichas do Databook (por obra).
        // Defaults preservam a saída atual: Cliente + Gestora ON, Construtora OFF.
        databookLogoCliente: smallint("databook_logo_cliente").default(1).notNull(),
        databookLogoGestora: smallint("databook_logo_gestora").default(1).notNull(),
        databookLogoConstrutora: smallint("databook_logo_construtora").default(0).notNull(),
        tipoContrato: varchar("tipo_contrato", { length: 30 }).default('global').notNull(),
        percentualGerenciamentoMaterial: numeric("percentual_gerenciamento_material", { precision: 5, scale: 2 }).default("0"),
        percentualAdm: numeric("percentual_adm", { precision: 5, scale: 2 }).default("0"),
        // Rev. 2882 — número do contrato da obra (cadastro), usado no campo "Contrato nº"
        // das fichas do Databook (substitui o nº da Ordem de Compra no doc. do cliente).
        numeroContrato: varchar("numero_contrato", { length: 50 }),
        // Jornada de trabalho POR DIA DA SEMANA da obra (JSON dia-a-dia, mesmo
        // formato de employees.jornadaTrabalho: { seg:{entrada,intervalo,saida}, ... }).
        // Quando preenchida, PREVALECE sobre a jornada do funcionário para todos
        // os alocados (dia vazio = folga). Vazia/null → vale a jornada do funcionário.
        jornadaTrabalho: text("jornada_trabalho"),
        // Rev. 3904 — TST e Encarregado da obra (SST / PT NR-35)
        tstId: integer("tst_id"),
        encarregadoId: integer("encarregado_id"),
},
(table) => [
        index("idx_obra_company").on(table.companyId),
        index("idx_obra_status").on(table.companyId, table.status),
]);

// Rev. 3451 — Múltiplos clientes por obra (tabela de junção).
// A coluna obras.cliente continua como "nome principal" para backward compat.
// Rev. 3454-hotfix: sem .references() — obras.id não tem .primaryKey() no schema Drizzle;
//   FK inline causava falha silenciosa no CREATE TABLE e a tabela nunca era criada.
export const obraClientes = pgTable("obra_clientes", {
  id: serial().primaryKey(),
  obraId: integer("obra_id").notNull(),
  clienteId: integer("cliente_id").notNull(),
  companyId: integer("company_id").notNull(),
  criadoEm: timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
},
(t) => [
  index("idx_obra_clientes_obra").on(t.obraId),
  index("idx_obra_clientes_cliente").on(t.clienteId),
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
        revisao: varchar({ length: 10 }).default('01'),
        revisaoMotivo: text(),
        criadoPor: varchar({ length: 255 }),
        criadoPorUserId: integer(),
        ordemId: integer("ordem_id"),
        obraId: integer("obra_id"),
        eapItens: text("eap_itens"),
        retencaoTecnicaPerc: numeric("retencao_tecnica_perc", { precision: 5, scale: 2 }).default("5"),
        diaCorte: integer("dia_corte").default(25),
        prazoAprovacaoDias: integer("prazo_aprovacao_dias").default(5),
        diaPagamento: integer("dia_pagamento").default(10),
        valorTotalContrato: numeric("valor_total_contrato", { precision: 14, scale: 2 }),
        valorMedido: numeric("valor_medido", { precision: 14, scale: 2 }).default("0"),
        valorRetido: numeric("valor_retido", { precision: 14, scale: 2 }).default("0"),
        limiteFd: numeric("limite_fd", { precision: 14, scale: 2 }),
        fdConsumido: numeric("fd_consumido", { precision: 14, scale: 2 }).default("0"),
        clausulasCustomizadas: text("clausulas_customizadas"),
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
        index("pjc_ordem").on(table.ordemId),
]);

export const pjContractRevisoes = pgTable("pj_contract_revisoes", {
        id: serial().notNull(),
        contractId: integer().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        revisaoNum: varchar({ length: 10 }).notNull(),
        motivo: text(),
        snapshot: text(),
        criadoPor: varchar({ length: 255 }),
        criadoPorUserId: integer(),
        criadoEm: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("pjcr_contract").on(table.contractId),
        index("pjcr_company").on(table.companyId),
]);

export const pjContractAditivos = pgTable("pj_contract_aditivos", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        contractId: integer().notNull(),
        employeeId: integer().notNull(),
        numeroAditivo: integer().default(1).notNull(),
        clausulasAlteradas: text().notNull(),
        dataAditivo: date({ mode: 'string' }).notNull(),
        observacoes: text(),
        criadoPor: varchar({ length: 255 }),
        criadoPorUserId: integer(),
        criadoEm: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("pjca_contract").on(table.contractId),
        index("pjca_company").on(table.companyId),
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
        fdDesconto: numeric("fd_desconto", { precision: 14, scale: 2 }).default("0"),
        fdDetalhe: text("fd_detalhe"),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
        index("pjm_company_mes").on(table.companyId, table.mesReferencia),
        index("pjm_contract").on(table.contractId),
        index("pjm_employee").on(table.employeeId),
        index("pjm_status").on(table.status),
]);

export const pjDocumentos = pgTable("pj_documentos", {
        id: serial().notNull(),
        companyId: integer("company_id").notNull(),
        employeeId: integer("employee_id").notNull(),
        contractId: integer("contract_id"),
        nome: varchar({ length: 255 }).notNull(),
        tipo: varchar({ length: 100 }).default('outro'),
        url: text().notNull(),
        storageKey: text("storage_key"),
        criadoPor: varchar("criado_por", { length: 255 }),
        criadoPorUserId: integer("criado_por_user_id"),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
        deletedAt: timestamp("deleted_at", { mode: 'string' }),
},
(table) => [
        index("pjd_company").on(table.companyId),
        index("pjd_employee").on(table.employeeId),
        index("pjd_contract").on(table.contractId),
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
        // Data prevista do pagamento (gerada a partir das regras do contrato).
        dataPrevista: date("data_prevista", { mode: 'string' }),
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
        // Rev. 3704 — garante unicidade: 1 pagamento por (empresa, contrato, mês, tipo).
        // Previne duplicatas que corrompiam a conciliação (valor dobrado no extrato).
        uniqueIndex("pjp_uniq_contrato_mes_tipo").on(table.companyId, table.contractId, table.mesReferencia, table.tipo),
]);

export const pontoConsolidacao = pgTable("ponto_consolidacao", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        mesReferencia: varchar({ length: 7 }).notNull(),
        dataInicioCiclo: date("data_inicio_ciclo", { mode: "string" }),
        dataFimCiclo: date("data_fim_ciclo", { mode: "string" }),
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
        index("ponto_consolidacao_ciclo").on(table.companyId, table.dataInicioCiclo, table.dataFimCiclo),
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
        totalDsrFalta: integer().default(0),
        totalDsrAtraso: integer().default(0),
        totalFeriadosPerdidos: integer().default(0),
        totalHeNaoAutorizadas: integer().default(0),
        totalMinutosHeNaoAutorizada: integer().default(0),
        valorTotalAtrasos: varchar({ length: 20 }).default('0'),
        valorTotalFaltas: varchar({ length: 20 }).default('0'),
        valorTotalDsr: varchar({ length: 20 }).default('0'),
        valorTotalDsrFalta: varchar({ length: 20 }).default('0'),
        valorTotalDsrAtraso: varchar({ length: 20 }).default('0'),
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
        tipoProcesso: varchar("tipo_processo", { length: 30 }).default('trabalhista').notNull(),
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
        index("pd_tipo_processo").on(table.tipoProcesso, table.processoId),
]);

export const processosAndamentos = pgTable("processos_andamentos", {
        id: serial().notNull(),
        processoId: integer().notNull(),
        tipoProcesso: varchar("tipo_processo", { length: 30 }).default('trabalhista').notNull(),
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
        index("pal_tipo_processo").on(table.tipoProcesso, table.processoId),
]);

export const processosTrabalhistas = pgTable("processos_trabalhistas", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer(),
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
        reclamados: varchar({ length: 500 }),
        regiao: varchar({ length: 50 }),
        resultado: varchar({ length: 50 }),
        andamentoProcessual: text(),
},
(table) => [
        index("pt_company").on(table.companyId),
        index("pt_employee").on(table.employeeId),
        index("pt_status").on(table.companyId, table.status),
        index("pt_numero").on(table.numeroProcesso),
]);

export const processosTributarios = pgTable("processos_tributarios", {
        id: serial("id").notNull(),
        companyId: integer("company_id").notNull(),
        numeroProcesso: varchar("numero_processo", { length: 50 }).notNull(),
        tipoTributo: text("tipo_tributo").default('icms').notNull(),
        esfera: text("esfera").default('judicial').notNull(),
        orgaoJulgador: varchar("orgao_julgador", { length: 255 }),
        vara: varchar("vara", { length: 100 }),
        comarca: varchar("comarca", { length: 100 }),
        tribunal: varchar("tribunal", { length: 100 }),
        autoInfracao: varchar("auto_infracao", { length: 100 }),
        valorAutoInfracao: varchar("valor_auto_infracao", { length: 20 }),
        valorCausa: varchar("valor_causa", { length: 20 }),
        valorCondenacao: varchar("valor_condenacao", { length: 20 }),
        valorPago: varchar("valor_pago", { length: 20 }),
        contribuinte: varchar("contribuinte", { length: 255 }).notNull(),
        cnpjContribuinte: varchar("cnpj_contribuinte", { length: 20 }),
        advogadoResponsavel: varchar("advogado_responsavel", { length: 255 }),
        dataDistribuicao: date("data_distribuicao", { mode: 'string' }),
        dataAutoInfracao: date("data_auto_infracao", { mode: 'string' }),
        dataAudiencia: date("data_audiencia", { mode: 'string' }),
        dataEncerramento: date("data_encerramento", { mode: 'string' }),
        status: text("status").default('em_andamento').notNull(),
        fase: text("fase").default('conhecimento').notNull(),
        risco: text("risco").default('medio').notNull(),
        observacoes: text("observacoes"),
        criadoPor: varchar("criado_por", { length: 255 }),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
        deletedAt: timestamp("deleted_at", { mode: 'string' }),
        deletedBy: varchar("deleted_by", { length: 255 }),
        deletedByUserId: integer("deleted_by_user_id"),
},
(table) => [
        index("ptrib_company").on(table.companyId),
        index("ptrib_status").on(table.companyId, table.status),
        index("ptrib_numero").on(table.numeroProcesso),
]);

export const processosCivis = pgTable("processos_civeis", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        numeroProcesso: varchar({ length: 50 }).notNull(),
        tipoAcao: text().default('cobranca').notNull(),
        vara: varchar({ length: 100 }),
        comarca: varchar({ length: 100 }),
        tribunal: varchar({ length: 100 }),
        autor: varchar({ length: 255 }).notNull(),
        reu: varchar({ length: 255 }).notNull(),
        advogadoAutor: varchar({ length: 255 }),
        advogadoReu: varchar({ length: 255 }),
        valorCausa: varchar({ length: 20 }),
        valorCondenacao: varchar({ length: 20 }),
        valorAcordo: varchar({ length: 20 }),
        valorPago: varchar({ length: 20 }),
        dataDistribuicao: date({ mode: 'string' }),
        dataCitacao: date({ mode: 'string' }),
        dataAudiencia: date({ mode: 'string' }),
        dataEncerramento: date({ mode: 'string' }),
        status: text().default('em_andamento').notNull(),
        fase: text().default('conhecimento').notNull(),
        risco: text().default('medio').notNull(),
        objetoAcao: text(),
        observacoes: text(),
        criadoPor: varchar({ length: 255 }),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        deletedAt: timestamp({ mode: 'string' }),
        deletedBy: varchar({ length: 255 }),
        deletedByUserId: integer(),
        resultado: varchar({ length: 50 }),
        andamentoProcessual: text(),
        polo: varchar({ length: 20 }).default('passivo'),
},
(table) => [
        index("pciv_company").on(table.companyId),
        index("pciv_status").on(table.companyId, table.status),
        index("pciv_numero").on(table.numeroProcesso),
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
        // Rev. 1259 — Rescisão complementar (uso interno) calculada apenas
        // sobre o complemento salarial "por fora". Null para funcionários
        // sem complemento. Não substitui a rescisão oficial.
        previsaoRescisaoComplementar: text(),
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
        dataBaixa: date({ mode: 'string' }),
        fgtsReal: varchar({ length: 20 }),
        fgtsEditadoManualmente: smallint().default(0),
        fgtsEditadoEm: timestamp({ mode: 'string' }),
        fgtsEditadoPor: varchar({ length: 255 }),
        descontosAcerto: varchar({ length: 20 }),
        descontosAcertoDesc: text(),
        acrescimosAcerto: varchar({ length: 20 }),
        acrescimosAcertoDesc: text(),
        novoEmpregoAtivo: smallint().default(0),
        novoEmpregoComunicadoEm: date({ mode: 'string' }),
        novoEmpregoCartaUrl: text(),
        // Rev. 1806 — Anexo do AVISO ASSINADO pelo colaborador (PDF/JPG/PNG).
        // Não confundir com novoEmpregoCartaUrl (Súmula 276 / cenário diferente).
        avisoAssinadoUrl: text("aviso_assinado_url"),
        avisoAssinadoEnviadoEm: timestamp("aviso_assinado_enviado_em", { mode: 'string' }),
        mediaInsalubridade: varchar("media_insalubridade", { length: 20 }).default('0'),
        mediaHorasExtras: varchar("media_horas_extras", { length: 20 }).default('0'),
        descontarAvisoNaoCumprido: smallint().default(0),
        baixaRescisaoValor: varchar("baixa_rescisao_valor", { length: 20 }),
        baixaRescisaoData: date("baixa_rescisao_data", { mode: 'string' }),
        baixaRescisaoPor: varchar("baixa_rescisao_por", { length: 255 }),
        baixaRescisaoObs: text("baixa_rescisao_obs"),
        baixaFgtsValor: varchar("baixa_fgts_valor", { length: 20 }),
        baixaFgtsData: date("baixa_fgts_data", { mode: 'string' }),
        baixaFgtsPor: varchar("baixa_fgts_por", { length: 255 }),
        baixaFgtsObs: text("baixa_fgts_obs"),
        // Rev. 1639 — Baixa da Rescisão Complementar (uso interno, "por fora").
        // Aparece apenas para funcionários com previsaoRescisaoComplementar.total > 0
        // (ex.: complemento salarial fora da CTPS). Não substitui a baixa oficial,
        // mas é exigida p/ conclusão quando aplicável.
        baixaComplementarValor: varchar("baixa_complementar_valor", { length: 20 }),
        baixaComplementarData: date("baixa_complementar_data", { mode: 'string' }),
        baixaComplementarPor: varchar("baixa_complementar_por", { length: 255 }),
        baixaComplementarObs: text("baixa_complementar_obs"),
        // Rev. 3278 — Complemento de DISSÍDIO p/ desligados (diferença retroativa do reajuste).
        // Campos PRÓPRIOS p/ NÃO colidir com o complemento "por fora" (baixaComplementar*).
        previsaoDissidioComplementar: text("previsao_dissidio_complementar"),
        baixaDissidioValor: varchar("baixa_dissidio_valor", { length: 20 }),
        baixaDissidioData: date("baixa_dissidio_data", { mode: 'string' }),
        baixaDissidioPor: varchar("baixa_dissidio_por", { length: 255 }),
        baixaDissidioObs: text("baixa_dissidio_obs"),
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
        tipoDia: varchar({ length: 20 }).default('normal'),
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
        allowedObraIds: text("allowed_obra_ids"),
        status: varchar({ length: 20 }).default('ativo'),
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
        mediaHE: varchar("media_he", { length: 20 }),
        mediaDSRHE: varchar("media_dsr_he", { length: 20 }),
        ajusteInss: varchar("ajuste_inss", { length: 20 }),
        valorLiquido: varchar("valor_liquido", { length: 20 }),
        bonusValor: varchar("bonus_valor", { length: 20 }),
        bonusDesc: text("bonus_desc"),
        pensaoDesconto: varchar("pensao_desconto", { length: 20 }),
        outrosDescontos: varchar("outros_descontos", { length: 20 }),
        outrosDescontosDesc: text("outros_descontos_desc"),
        arredondamentoProvento: varchar("arredondamento_provento", { length: 20 }),
        reciboUrl: text("recibo_url"),
        reciboNome: varchar("recibo_nome", { length: 255 }),
        // you can use { mode: 'date' }, if you want to have Date as type for this column
        dataPagamento: date({ mode: 'string' }),
        // Rev. 3273 — carimbo de quando a férias passou a "agendada" (exibido sob a tag Agendada)
        dataAgendamento: timestamp({ mode: 'string' }),
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
        faltasInjustificadas: integer("faltas_injustificadas"),
        diasDireitoOriginal: integer("dias_direito_original"),
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
        anoModelo: varchar("ano_modelo", { length: 4 }),
        renavam: varchar({ length: 20 }),
        chassi: varchar({ length: 30 }),
        cor: varchar({ length: 30 }),
        kmAtual: numeric("km_atual", { precision: 12, scale: 1 }).default("0"),
        responsavel: varchar({ length: 255 }),
        motoristaId: integer("motorista_id"),
        motoristaPadrao: varchar("motorista_padrao", { length: 255 }),
        motoristaPadraoInicio: date("motorista_padrao_inicio", { mode: "string" }),
        obraId: integer("obra_id"),
        statusVeiculo: text().default('Ativo').notNull(),
        proximaManutencao: date({ mode: 'string' }),
        dataAquisicao: date("data_aquisicao", { mode: 'string' }),
        valorCompra: numeric("valor_compra", { precision: 14, scale: 2 }),
        valorFipe: numeric("valor_fipe", { precision: 14, scale: 2 }),
        valorVenda: numeric("valor_venda", { precision: 14, scale: 2 }),
        fipeCodigoMarca: varchar("fipe_codigo_marca", { length: 10 }),
        fipeCodigoModelo: varchar("fipe_codigo_modelo", { length: 10 }),
        fipeCodigoAno: varchar("fipe_codigo_ano", { length: 10 }),
        fipeReferencia: varchar("fipe_referencia", { length: 20 }),
        depreciacaoAnos: integer("depreciacao_anos").default(5),
        valorResidual: numeric("valor_residual", { precision: 14, scale: 2 }).default("0"),
        fotoUrl: text("foto_url"),
        crlvUrl: text("crlv_url"),
        crlvVencimento: date("crlv_vencimento", { mode: 'string' }),
        seguroUrl: text("seguro_url"),
        seguroVencimento: date("seguro_vencimento", { mode: 'string' }),
        documentos: jsonb("documentos").default([]),
        categoriaUso: text("categoria_uso"),
        observacoes: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (t) => [
        index("idx_vehicles_company").on(t.companyId),
        index("idx_vehicles_placa").on(t.placa),
        index("idx_vehicles_status").on(t.statusVeiculo),
]);

export const fleetMaintenances = pgTable("fleet_maintenances", {
        id: serial().primaryKey(),
        companyId: integer("company_id").notNull(),
        vehicleId: integer("vehicle_id").notNull(),
        tipo: varchar({ length: 30 }).notNull().default("corretiva"),
        descricao: text().notNull(),
        custo: numeric({ precision: 14, scale: 2 }).default("0"),
        kmNaManutencao: numeric("km_na_manutencao", { precision: 12, scale: 1 }),
        fornecedor: varchar({ length: 255 }),
        dataManutencao: date("data_manutencao", { mode: 'string' }).notNull(),
        dataProxima: date("data_proxima", { mode: 'string' }),
        kmProxima: numeric("km_proxima", { precision: 12, scale: 1 }),
        status: varchar({ length: 30 }).notNull().default("realizada"),
        observacoes: text(),
        criadoPor: varchar("criado_por", { length: 255 }),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (t) => [
        index("idx_fleet_maint_company").on(t.companyId),
        index("idx_fleet_maint_vehicle").on(t.vehicleId),
        index("idx_fleet_maint_status").on(t.status),
]);

export const fleetFuelRecords = pgTable("fleet_fuel_records", {
        id: serial().primaryKey(),
        companyId: integer("company_id").notNull(),
        vehicleId: integer("vehicle_id").notNull(),
        data: date({ mode: 'string' }).notNull(),
        litros: numeric({ precision: 10, scale: 3 }).notNull(),
        valorTotal: numeric("valor_total", { precision: 14, scale: 2 }).notNull(),
        precoLitro: numeric("preco_litro", { precision: 8, scale: 4 }),
        kmAtual: numeric("km_atual", { precision: 12, scale: 1 }),
        kmAnterior: numeric("km_anterior", { precision: 12, scale: 1 }),
        consumoKmL: numeric("consumo_km_l", { precision: 8, scale: 2 }),
        tipoCombustivel: varchar("tipo_combustivel", { length: 30 }).default("gasolina"),
        motorista: varchar({ length: 255 }),
        posto: varchar({ length: 255 }),
        numDoc: varchar("num_doc", { length: 20 }),
        desconto: numeric({ precision: 14, scale: 2 }),
        observacoes: text(),
        criadoPor: varchar("criado_por", { length: 255 }),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (t) => [
        index("idx_fleet_fuel_company").on(t.companyId),
        index("idx_fleet_fuel_vehicle").on(t.vehicleId),
]);

export const fleetTrackingPoints = pgTable("fleet_tracking_points", {
        id: serial().primaryKey(),
        companyId: integer("company_id").notNull(),
        vehicleId: integer("vehicle_id").notNull(),
        latitude: numeric({ precision: 10, scale: 7 }).notNull(),
        longitude: numeric({ precision: 10, scale: 7 }).notNull(),
        velocidade: numeric({ precision: 6, scale: 1 }),
        ignicao: boolean().default(false),
        dataHora: timestamp("data_hora", { mode: 'string' }).notNull(),
        origem: varchar({ length: 30 }).default("csv"),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (t) => [
        index("idx_fleet_track_company").on(t.companyId),
        index("idx_fleet_track_vehicle").on(t.vehicleId),
        index("idx_fleet_track_datetime").on(t.dataHora),
]);

export const fleetDocuments = pgTable("fleet_documents", {
        id: serial().primaryKey(),
        companyId: integer("company_id").notNull(),
        vehicleId: integer("vehicle_id").notNull(),
        tipo: varchar({ length: 50 }).notNull(),
        nome: varchar({ length: 255 }).notNull(),
        url: text().notNull(),
        vencimento: date({ mode: 'string' }),
        observacoes: text(),
        criadoPor: varchar("criado_por", { length: 255 }),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (t) => [
        index("idx_fleet_docs_company").on(t.companyId),
        index("idx_fleet_docs_vehicle").on(t.vehicleId),
]);

export const fleetFines = pgTable("fleet_fines", {
        id: serial().primaryKey(),
        companyId: integer("company_id").notNull(),
        vehicleId: integer("vehicle_id").notNull(),
        autoInfracao: varchar("auto_infracao", { length: 50 }),
        dataInfracao: date("data_infracao", { mode: 'string' }).notNull(),
        dataVencimento: date("data_vencimento", { mode: 'string' }),
        codigoInfracao: varchar("codigo_infracao", { length: 20 }),
        descricao: text().notNull(),
        gravidade: varchar({ length: 20 }).default("media"),
        pontos: integer().default(0),
        valorOriginal: numeric("valor_original", { precision: 10, scale: 2 }).notNull(),
        valorComDesconto: numeric("valor_com_desconto", { precision: 10, scale: 2 }),
        valorPago: numeric("valor_pago", { precision: 10, scale: 2 }),
        status: varchar({ length: 30 }).notNull().default("pendente"),
        motorista: varchar({ length: 255 }),
        local: text(),
        recurso: boolean().default(false),
        recursoStatus: varchar("recurso_status", { length: 30 }),
        recursoObservacoes: text("recurso_observacoes"),
        comprovanteUrl: text("comprovante_url"),
        observacoes: text(),
        criadoPor: varchar("criado_por", { length: 255 }),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (t) => [
        index("idx_fleet_fines_company").on(t.companyId),
        index("idx_fleet_fines_vehicle").on(t.vehicleId),
        index("idx_fleet_fines_status").on(t.status),
]);

export const fleetIpva = pgTable("fleet_ipva", {
        id: serial().primaryKey(),
        companyId: integer("company_id").notNull(),
        vehicleId: integer("vehicle_id").notNull(),
        anoReferencia: integer("ano_referencia").notNull(),
        valorTotal: numeric("valor_total", { precision: 10, scale: 2 }).notNull(),
        parcelas: integer().default(1),
        parcelaAtual: integer("parcela_atual").default(0),
        valorPago: numeric("valor_pago", { precision: 10, scale: 2 }).default("0"),
        dataVencimento: date("data_vencimento", { mode: 'string' }),
        dataPagamento: date("data_pagamento", { mode: 'string' }),
        status: varchar({ length: 30 }).notNull().default("pendente"),
        comprovanteUrl: text("comprovante_url"),
        observacoes: text(),
        criadoPor: varchar("criado_por", { length: 255 }),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (t) => [
        index("idx_fleet_ipva_company").on(t.companyId),
        index("idx_fleet_ipva_vehicle").on(t.vehicleId),
]);

export const fleetLicensing = pgTable("fleet_licensing", {
        id: serial().primaryKey(),
        companyId: integer("company_id").notNull(),
        vehicleId: integer("vehicle_id").notNull(),
        anoExercicio: integer("ano_exercicio").notNull(),
        dataVencimento: date("data_vencimento", { mode: 'string' }),
        dataPagamento: date("data_pagamento", { mode: 'string' }),
        valor: numeric({ precision: 10, scale: 2 }),
        status: varchar({ length: 30 }).notNull().default("pendente"),
        crlvDigitalUrl: text("crlv_digital_url"),
        observacoes: text(),
        criadoPor: varchar("criado_por", { length: 255 }),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (t) => [
        index("idx_fleet_lic_company").on(t.companyId),
        index("idx_fleet_lic_vehicle").on(t.vehicleId),
]);

export const fleetInsurance = pgTable("fleet_insurance", {
        id: serial().primaryKey(),
        companyId: integer("company_id").notNull(),
        vehicleId: integer("vehicle_id").notNull(),
        seguradora: varchar({ length: 255 }).notNull(),
        numeroApolice: varchar("numero_apolice", { length: 100 }),
        tipoCobertura: varchar("tipo_cobertura", { length: 50 }).default("compreensivo"),
        dataInicio: date("data_inicio", { mode: 'string' }).notNull(),
        dataFim: date("data_fim", { mode: 'string' }).notNull(),
        valorPremio: numeric("valor_premio", { precision: 14, scale: 2 }),
        franquia: numeric({ precision: 14, scale: 2 }),
        coberturas: text(),
        restricoes: text(),
        apoliceUrl: text("apolice_url"),
        iaAnalisada: boolean("ia_analisada").default(false),
        iaResumo: text("ia_resumo"),
        iaRegrasImportantes: text("ia_regras_importantes"),
        iaAlertasRisco: text("ia_alertas_risco"),
        iaCoberturasDetalhadas: text("ia_coberturas_detalhadas"),
        iaExclusoes: text("ia_exclusoes"),
        iaLimitesIndenizacao: text("ia_limites_indenizacao"),
        status: varchar({ length: 30 }).notNull().default("ativa"),
        observacoes: text(),
        corretor: varchar({ length: 255 }),
        apoliceArquivoNome: varchar("apolice_arquivo_nome", { length: 500 }),
        criadoPor: varchar("criado_por", { length: 255 }),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (t) => [
        index("idx_fleet_ins_company").on(t.companyId),
        index("idx_fleet_ins_vehicle").on(t.vehicleId),
        index("idx_fleet_ins_status").on(t.status),
]);

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
        diasUteisCalc: integer(),
        cidadeObra: varchar({ length: 100 }),
        diasFerias: integer().default(0),
        diasLicenca: integer().default(0),
        diasFaltas: integer().default(0),
        diasDescontados: integer().default(0),
        proporcionalDias: integer(),
        memoriaCalculo: text(),
},
(table) => [
        index("vr_company_mes").on(table.companyId, table.mesReferencia),
        index("vr_employee").on(table.employeeId),
]);

export const vaFaltaAlerts = pgTable("va_falta_alerts", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        mesReferencia: varchar({ length: 7 }).notNull(),
        obraId: integer(),
        dataFalta: date({ mode: 'string' }).notNull(),
        tipoFalta: varchar({ length: 30 }).default('injustificada'),
        temAtestado: smallint().default(0),
        decisao: varchar({ length: 20 }).default('pendente'),
        descontarCafe: smallint().default(0),
        descontarLanche: smallint().default(0),
        descontarJantar: smallint().default(0),
        valorDescontoCafe: varchar({ length: 20 }).default('0'),
        valorDescontoLanche: varchar({ length: 20 }).default('0'),
        valorDescontoJantar: varchar({ length: 20 }).default('0'),
        decidido_por: varchar({ length: 255 }),
        decidido_por_user_id: integer(),
        decidido_em: timestamp({ mode: 'string' }),
        observacoes: text(),
        vrBenefitId: integer(),
        feriadoInfo: text(),
        createdAt: timestamp({ mode: 'string' }).defaultNow(),
        updatedAt: timestamp({ mode: 'string' }).defaultNow(),
}, (table) => [
        index("idx_va_falta_company_mes").on(table.companyId, table.mesReferencia),
        index("idx_va_falta_employee").on(table.employeeId),
        index("idx_va_falta_decisao").on(table.decisao),
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
        assinaturaFuncionarioUrl: text("assinatura_funcionario_url"),
        assinaturaAplicadorUrl:   text("assinatura_aplicador_url"),
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
  // Rev. 3516 — regras especiais de pagamento por produto (JSON array)
  regrasProdutoJson: text("regras_produto_json"),
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
  // Ciclo de fechamento (agrupamento de compras na conciliação)
  cicloPagamento: varchar("ciclo_pagamento", { length: 20 }),
  cicloDiaFechamento: integer("ciclo_dia_fechamento"),
  cicloNumParcelas: integer("ciclo_num_parcelas").default(1),
  cicloPrazoParcela: integer("ciclo_prazo_parcela").default(30),
  cicloFormaPagamento: varchar("ciclo_forma_pagamento", { length: 20 }),
  // Rev. 3514 — ciclo quinzenal ancorado no dia da semana
  cicloDataReferencia: varchar("ciclo_data_referencia", { length: 10 }),
  // Vínculo com cadastro de fornecedor (Compras)
  fornecedorId: integer("fornecedor_id"),
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
  // Rev. 1998 — Número interno auto-gerado no formato [SIGLA_EMPRESA]-[SEQ_GLOBAL]
  // SIGLA: 3 primeiras letras do nomeFantasia/razaoSocial (sem acentos, A-Z)
  // SEQ: sequencial global por tenant (companyId), padded em 5 dígitos
  numeroInterno: varchar("numero_interno", { length: 30 }),
  // Dados pessoais
  nome: varchar({ length: 255 }).notNull(),
  cpf: varchar({ length: 14 }),
  rg: varchar({ length: 20 }),
  dataNascimento: timestamp("data_nascimento", { mode: "string" }),
  fotoUrl: varchar("foto_url", { length: 500 }),
  funcao: varchar({ length: 100 }),
  telefone: varchar({ length: 30 }),
  email: varchar({ length: 255 }),
  // Rev. 2008 — Endereço residencial do terceiro (saber de onde vêm pra logística/RH/SST)
  cep: varchar({ length: 10 }),
  logradouro: varchar({ length: 255 }),
  numeroEndereco: varchar("numero_endereco", { length: 20 }),
  complemento: varchar({ length: 100 }),
  bairro: varchar({ length: 100 }),
  cidade: varchar({ length: 100 }),
  uf: varchar({ length: 2 }),
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
  // Rev. 2003 — Integração admissional é DUPLA: na Construtora (FC) E no Cliente final.
  // `integracaoDocUrl` (legacy) passa a representar Construtora; `integracaoClienteDocUrl` é o novo doc do cliente.
  integracaoClienteDocUrl: varchar("integracao_cliente_doc_url", { length: 500 }),
  // Rev. 2017 — Documentos Trabalhistas obrigatórios (Ficha de EPI NR-06, OS de SST NR-01, Registro de Empregado CLT art. 41)
  fichaEpiUrl: varchar("ficha_epi_url", { length: 500 }),
  ordemServicoUrl: varchar("ordem_servico_url", { length: 500 }),
  registroFuncionarioUrl: varchar("registro_funcionario_url", { length: 500 }),
  // Rev. 2031 — Documentos avulsos por categoria (além dos campos fixos acima).
  // Array de { id: string, categoria: "saude_ocupacional"|"treinamentos_nr"|"integracao_seguranca"|"documentos_trabalhistas"|"identificacao_qualificacao", label: string, url: string, validade?: string, uploadedAt: string }
  // Permite que o usuário cadastre quantos documentos quiser em cada categoria sem precisar alterar schema.
  documentosExtras: jsonb("documentos_extras"),
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

// Rev. 2004 — Controle de DDS (Diálogo Diário de Segurança) dos funcionários terceiros.
// Registra cada participação do funcionário terceiro em DDS da Construtora (FC).
// Diferente da integração admissional (1x), DDS é recorrente — várias vezes por mês/ano.
export const ddsParticipacoesTerceiros = pgTable("dds_participacoes_terceiros", {
  id: serial().primaryKey(),
  companyId: integer("company_id").notNull(),
  funcTerceiroId: integer("func_terceiro_id").notNull(),
  // Rev. 2024 — vínculo opcional com a sessão coletiva (ddsSessoes.id). Quando
  // a participação foi registrada via "Nova Sessão" (DDS coletivo), aponta pra
  // sessão. Quando foi cadastrada manualmente na tela do terceiro (DDS avulso),
  // fica NULL. Isso permite ao detalhe da sessão listar terceiros participantes
  // sem heurística por data/tema/obra.
  sessaoId: integer("sessao_id"),
  dataDds: date("data_dds", { mode: "string" }).notNull(),
  tema: varchar({ length: 255 }).notNull(),
  instrutor: varchar({ length: 255 }),
  obraId: integer("obra_id"),
  obraNome: varchar("obra_nome", { length: 255 }),
  listaPresencaUrl: varchar("lista_presenca_url", { length: 500 }),
  observacoes: text(),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  createdBy: varchar("created_by", { length: 255 }),
  deletedAt: timestamp("deleted_at", { mode: "string" }),
});

export const warningsTerceiros = pgTable("warnings_terceiros", {
  id: serial().primaryKey(),
  companyId: integer("company_id").notNull(),
  empresaTerceiraId: integer("empresa_terceira_id").notNull(),
  funcionarioTerceiroId: integer("funcionario_terceiro_id"),
  funcionarioNomeManual: varchar("funcionario_nome_manual", { length: 255 }),
  funcionarioCpfManual: varchar("funcionario_cpf_manual", { length: 20 }),
  funcionarioFuncaoManual: varchar("funcionario_funcao_manual", { length: 120 }),
  tipoAdvertencia: text("tipo_advertencia").notNull(), // Notificacao, Advertencia, Suspensao, SolicitacaoSubstituicao
  dataOcorrencia: date("data_ocorrencia", { mode: "string" }).notNull(),
  motivo: text().notNull(),
  descricao: text(),
  testemunhas: text(), // JSON
  documentoUrl: text("documento_url"),
  sequencia: integer().default(1),
  aplicadoPor: varchar("aplicado_por", { length: 255 }),
  diasSuspensao: integer("dias_suspensao"),
  obraId: integer("obra_id"),
  obraNome: varchar("obra_nome", { length: 255 }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  createdBy: varchar("created_by", { length: 255 }),
  deletedAt: timestamp("deleted_at", { mode: "string" }),
  deletedBy: varchar("deleted_by", { length: 255 }),
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
// MÓDULO TERCEIROS — CONTRATOS DE SERVIÇO E MEDIÇÕES
// ============================================================

export const terceiroContratos = pgTable("terceiro_contratos", {
  id:                serial().primaryKey(),
  companyId:         integer("company_id").notNull(),
  empresaTerceiraId: integer("empresa_terceira_id").notNull(),
  obraId:            integer("obra_id"),
  obraNome:          varchar("obra_nome", { length: 255 }),
  planejamentoProjetoId: integer("planejamento_projeto_id"),
  orcamentoId:       integer("orcamento_id"),
  numeroContrato:    varchar("numero_contrato", { length: 50 }),
  numeroSequencia:   integer("numero_sequencia"),
  templateId:        integer("template_id"),
  textoContrato:     text("texto_contrato"),
  versaoTexto:       integer("versao_texto").default(0),
  descricao:         varchar({ length: 500 }).notNull(),
  tipoContrato:      varchar("tipo_contrato", { length: 50 }).default("empreitada_global"), // empreitada_global | preco_unitario | misto
  // Rev. 2830 — NATUREZA do contrato (o QUE ele cobre), distinta do tipoContrato (modelo de PREÇO):
  // mao_de_obra (só MDO) | material (só material) | mao_de_obra_material (MDO + material juntos).
  // Material pode virar FD (vindo das cotações/OCs) e é DESCONTADO do valor do contrato.
  naturezaContrato:  varchar("natureza_contrato", { length: 30 }).default("mao_de_obra"),
  valorOrcamento:    numeric("valor_orcamento", { precision: 18, scale: 2 }).default("0"),
  valorTotal:        numeric("valor_total", { precision: 18, scale: 2 }).default("0"),
  valorPago:         numeric("valor_pago", { precision: 18, scale: 2 }).default("0"),
  dataInicio:        date("data_inicio"),
  dataTermino:       date("data_termino"),
  status:            varchar({ length: 50 }).default("ativo"), // ativo | encerrado | suspenso | concluido
  observacoes:       text(),
  percISS:           numeric("perc_iss", { precision: 6, scale: 3 }).default("0"),
  percINSS:          numeric("perc_inss", { precision: 6, scale: 3 }).default("0"),
  percIRRF:          numeric("perc_irrf", { precision: 6, scale: 3 }).default("0"),
  percOutrasRetencoes: numeric("perc_outras_retencoes", { precision: 6, scale: 3 }).default("0"),
  percRetencaoTecnica: numeric("perc_retencao_tecnica", { precision: 6, scale: 3 }).default("0"),
  testemunhaFinanceiro: varchar("testemunha_financeiro", { length: 255 }),
  testemunhaGestorProjeto: varchar("testemunha_gestor_projeto", { length: 255 }),
  criadoPor:         varchar("criado_por", { length: 255 }),
  criadoEm:          timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
  atualizadoEm:      timestamp("atualizado_em", { mode: "string" }).defaultNow().notNull(),
  databookObrigatorio: boolean("databook_obrigatorio").default(false),
  databookStatus:    varchar("databook_status", { length: 30 }).default("nao_aplicavel"),
  diaMedicao:        integer("dia_medicao").default(25),
  diaPagamento:      integer("dia_pagamento").default(10),
  prazoAprovacaoDias: integer("prazo_aprovacao_dias").default(5),
  documentacaoNecessaria: text("documentacao_necessaria"),
  fluxogramaEtapas:  text("fluxograma_etapas"),
  prazoEmissaoNf:    integer("prazo_emissao_nf").default(3),
  prazoLiberacaoOp:  integer("prazo_liberacao_op").default(5),
  // === Cancelamento por admin master (Rev. 2909) ===
  canceladoPor:      varchar("cancelado_por", { length: 255 }),
  canceladoEm:       timestamp("cancelado_em", { mode: "string" }),
  motivoCancelamento: text("motivo_cancelamento"),
});

export const terceiroContratoItens = pgTable("terceiro_contrato_itens", {
  id:                  serial().primaryKey(),
  contratoId:          integer("contrato_id").notNull(),
  companyId:           integer("company_id").notNull(),
  planejamentoAtividadeId: integer("planejamento_atividade_id"),
  eapCodigo:           varchar("eap_codigo", { length: 100 }),
  orcamentoItemId:     integer("orcamento_item_id"),
  descricao:           varchar({ length: 500 }).notNull(),
  unidade:             varchar({ length: 30 }),
  quantidade:          numeric({ precision: 18, scale: 4 }).default("1"),
  valorUnitario:       numeric("valor_unitario", { precision: 18, scale: 4 }).default("0"),
  valorTotal:          numeric("valor_total", { precision: 18, scale: 2 }).default("0"),
  vlrMat:              numeric("vlr_mat", { precision: 18, scale: 2 }),
  vlrMdo:              numeric("vlr_mdo", { precision: 18, scale: 2 }),
  percentualMedidoAcumulado: numeric("percentual_medido_acumulado", { precision: 8, scale: 4 }).default("0"),
  valorMedidoAcumulado: numeric("valor_medido_acumulado", { precision: 18, scale: 2 }).default("0"),
  ordem:               integer().default(0),
  criadoEm:            timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
});

// Template padrão de contrato — armazenado por empresa, com variáveis {{PLACEHOLDER}}
export const terceiroContratoTemplates = pgTable("terceiro_contrato_templates", {
  id:           serial().primaryKey(),
  companyId:    integer("company_id").notNull(),
  nome:         varchar({ length: 200 }).notNull().default("Contrato Padrão"),
  texto:        text().notNull(),
  ativo:        boolean().default(true),
  versao:       integer().default(1),
  criadoEm:     timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em", { mode: "string" }).defaultNow().notNull(),
});

export const terceiroTemplateRevisoes = pgTable("terceiro_template_revisoes", {
  id:          serial().primaryKey(),
  templateId:  integer("template_id").notNull(),
  companyId:   integer("company_id").notNull(),
  versao:      integer().notNull(),
  nome:        varchar({ length: 200 }).notNull(),
  texto:       text().notNull(),
  observacao:  varchar({ length: 200 }),
  criadoPor:   varchar("criado_por", { length: 200 }),
  criadoEm:    timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
});

export const terceiroContratoRevisoes = pgTable("terceiro_contrato_revisoes", {
  id:          serial().primaryKey(),
  contratoId:  integer("contrato_id").notNull(),
  companyId:   integer("company_id").notNull(),
  versao:      integer().notNull(),
  texto:       text().notNull(),
  observacao:  varchar({ length: 200 }),
  criadoPor:   varchar("criado_por", { length: 200 }),
  criadoEm:    timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
});

export const terceiroMedicoes = pgTable("terceiro_medicoes", {
  id:                serial().primaryKey(),
  contratoId:        integer("contrato_id").notNull(),
  companyId:         integer("company_id").notNull(),
  empresaTerceiraId: integer("empresa_terceira_id").notNull(),
  obraId:            integer("obra_id"),
  numero:            integer().default(1),
  periodo:           varchar({ length: 7 }).notNull(), // YYYY-MM
  dataReferencia:    date("data_referencia"),
  dataInicio:        date("data_inicio", { mode: "string" }),
  dataFim:           date("data_fim", { mode: "string" }),
  valorMedido:       numeric("valor_medido", { precision: 18, scale: 2 }).default("0"),
  valorAcumulado:    numeric("valor_acumulado", { precision: 18, scale: 2 }).default("0"),
  percentualGlobal:  numeric("percentual_global", { precision: 8, scale: 4 }).default("0"),
  status:            varchar({ length: 50 }).default("rascunho"), // rascunho | aguardando_aprovacao | aprovada | paga | rejeitada
  aprovadoPor:       varchar("aprovado_por", { length: 255 }),
  aprovadoEm:        timestamp("aprovado_em", { mode: "string" }),
  observacoes:       text(),
  motivoRejeicao:    text("motivo_rejeicao"),
  rejeitadoPor:      varchar("rejeitado_por", { length: 255 }),
  rejeitadoEm:       timestamp("rejeitado_em", { mode: "string" }),
  geradoAutomaticamente: boolean("gerado_automaticamente").default(false),
  alertaDivergencia: text("alerta_divergencia"),
  retencaoISS:       numeric("retencao_iss", { precision: 18, scale: 2 }).default("0"),
  retencaoINSS:      numeric("retencao_inss", { precision: 18, scale: 2 }).default("0"),
  retencaoIRRF:      numeric("retencao_irrf", { precision: 18, scale: 2 }).default("0"),
  outrasRetencoes:   numeric("outras_retencoes", { precision: 18, scale: 2 }).default("0"),
  retencaoTecnica:   numeric("retencao_tecnica", { precision: 18, scale: 2 }).default("0"),
  descontos:         numeric({ precision: 18, scale: 2 }).default("0"),
  observacoesRetencao: text("observacoes_retencao"),
  // Rev. 3078 — Aprovação em 3 níveis (mede → gestor da obra → sócio adm).
  nivelAprovacao:    integer("nivel_aprovacao").default(0).notNull(), // 0 medido, 1 gestor ok, 2 sócio ok (final)
  gestorAprovadoPor: varchar("gestor_aprovado_por", { length: 255 }),
  gestorAprovadoEm:  timestamp("gestor_aprovado_em", { mode: "string" }),
  socioAprovadoPor:  varchar("socio_aprovado_por", { length: 255 }),
  socioAprovadoEm:   timestamp("socio_aprovado_em", { mode: "string" }),
  // Rev. 3078 — Vínculo com o levantamento de campo + snapshot p/ alerta de divergência.
  levantamentoCampoId:   integer("levantamento_campo_id"),
  quantidadeLevantada:   numeric("quantidade_levantada", { precision: 18, scale: 4 }),
  unidadeLevantada:      varchar("unidade_levantada", { length: 20 }),
  percentualDivergencia: numeric("percentual_divergencia", { precision: 8, scale: 4 }),
  // Rev. 3078 — Total de FD (auto OCs + manual) abatido nesta medição.
  fdTotalAbatido:    numeric("fd_total_abatido", { precision: 18, scale: 2 }).default("0").notNull(),
  // Rev. 4284 — Breakdown de descontos calculados na liquidação do boletim.
  adiantamentoAmortizacaoValor: numeric("adiantamento_amortizacao_valor", { precision: 18, scale: 2 }).default("0"),
  retencaoGarantiaValor:        numeric("retencao_garantia_valor", { precision: 18, scale: 2 }).default("0"),
  valorLiquidoPagamento:        numeric("valor_liquido_pagamento", { precision: 18, scale: 2 }).default("0"),
  criadoPor:         varchar("criado_por", { length: 255 }),
  criadoEm:          timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
  atualizadoEm:      timestamp("atualizado_em", { mode: "string" }).defaultNow().notNull(),
});

// Rev. 3078 — FD manual por medição de terceiro (o auto vem de medicao_fd_registros/OCs).
// data_fd define em qual medição entra (período início→corte do Dia da Medição). Anexo opcional.
export const terceiroMedicaoFds = pgTable("terceiro_medicao_fds", {
  id:           serial().primaryKey(),
  companyId:    integer("company_id").notNull(),
  contratoId:   integer("contrato_id").notNull(),
  medicaoId:    integer("medicao_id"),
  descricao:    varchar({ length: 500 }).notNull(),
  valor:        numeric({ precision: 18, scale: 2 }).notNull(),
  dataFd:       date("data_fd").notNull(),
  anexoUrl:     varchar("anexo_url", { length: 500 }),
  origem:       varchar({ length: 20 }).default("manual").notNull(), // manual | auto
  observacoes:  text(),
  criadoPor:    varchar("criado_por", { length: 255 }),
  criadoEm:     timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em", { mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("idx_tmfds_contrato").on(t.contratoId),
  index("idx_tmfds_medicao").on(t.medicaoId),
  index("idx_tmfds_company").on(t.companyId),
]);

export const terceiroMedicaoItens = pgTable("terceiro_medicao_itens", {
  id:                serial().primaryKey(),
  medicaoId:         integer("medicao_id").notNull(),
  contratoItemId:    integer("contrato_item_id").notNull(),
  companyId:         integer("company_id").notNull(),
  descricao:         varchar({ length: 500 }),
  percentualAvancoFisico:   numeric("percentual_avanco_fisico", { precision: 8, scale: 4 }).default("0"),
  percentualAcumuladoAnterior: numeric("percentual_acumulado_anterior", { precision: 8, scale: 4 }).default("0"),
  percentualMedidoPeriodo:  numeric("percentual_medido_periodo", { precision: 8, scale: 4 }).default("0"),
  percentualFisicoReal:    numeric("percentual_fisico_real", { precision: 8, scale: 4 }),
  editadoManualmente:      boolean("editado_manualmente").default(false),
  valorMedidoPeriodo:       numeric("valor_medido_periodo", { precision: 18, scale: 2 }).default("0"),
  valorAcumulado:           numeric("valor_acumulado", { precision: 18, scale: 2 }).default("0"),
  valorMatPeriodo:          numeric("valor_mat_periodo", { precision: 18, scale: 2 }).default("0"),
  valorMdoPeriodo:          numeric("valor_mdo_periodo", { precision: 18, scale: 2 }).default("0"),
  valorMatAcumulado:        numeric("valor_mat_acumulado", { precision: 18, scale: 2 }).default("0"),
  valorMdoAcumulado:        numeric("valor_mdo_acumulado", { precision: 18, scale: 2 }).default("0"),
  observacoes:       text(),
  criadoEm:          timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
});

export const terceiroDocumentos = pgTable("terceiro_documentos", {
  id:                serial().primaryKey(),
  contratoId:        integer("contrato_id").notNull(),
  companyId:         integer("company_id").notNull(),
  empresaTerceiraId: integer("empresa_terceira_id").notNull(),
  tipo:              varchar({ length: 100 }).notNull(), // INSS | FGTS | CND | folha_pagamento | seguro | outro
  descricao:         varchar({ length: 255 }),
  competencia:       varchar({ length: 7 }), // YYYY-MM (para docs mensais)
  url:               varchar({ length: 500 }),
  dataVencimento:    date("data_vencimento"),
  status:            varchar({ length: 50 }).default("pendente"), // pendente | enviado | aprovado | vencido
  bloqueiaPagemento: boolean("bloqueia_pagamento").default(false),
  observacoes:       text(),
  enviadoPor:        varchar("enviado_por", { length: 255 }),
  validadoPor:       varchar("validado_por", { length: 255 }),
  validadoEm:        timestamp("validado_em", { mode: "string" }),
  criadoEm:          timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
  atualizadoEm:      timestamp("atualizado_em", { mode: "string" }).defaultNow().notNull(),
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
  disabledPages: text("disabled_pages"), // JSON array of page paths disabled for this module
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
}, (table) => [
  index("mc_company_module").on(table.companyId, table.moduleKey),
]);


// ========== IA POR MÓDULO - LIGA/DESLIGA (Rev. 2805) ==========
// Toggle por empresa que habilita/desabilita as funcionalidades de IA de cada
// módulo. Ausência de linha = HABILITADO (default permissivo). Ver shared/aiModules.ts.
export const aiModuleConfig = pgTable("ai_module_config", {
  id: serial().primaryKey(),
  companyId: integer("company_id").notNull(), // Rev. 2810 — coluna real é snake_case (self-heal); sem o nome explícito o Drizzle gerava "companyId" e TODA query falhava
  modulo: varchar({ length: 40 }).notNull(), // AiModuleKey — ver shared/aiModules.ts
  enabled: smallint().default(1).notNull(),  // 1 = habilitado, 0 = desabilitado
  updatedBy: varchar("updated_by", { length: 255 }),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uniq_ai_module_company").on(table.companyId, table.modulo),
]);


// ========== PORTAL EXTERNO - CREDENCIAIS ==========
export const portalCredentials = pgTable("portal_credentials", {
  id: serial().primaryKey(),
  tipo: text().notNull(),
  empresaTerceiraId: integer(),
  parceiroId: integer(),
  clienteId: integer("cliente_id"),
  companyId: integer().notNull(),
  cnpj: varchar({ length: 20 }).notNull(),
  senhaHash: varchar("senha_hash", { length: 255 }).notNull(),
  nomeEmpresa: varchar("nome_empresa", { length: 255 }),
  emailResponsavel: varchar("email_responsavel", { length: 255 }),
  nomeResponsavel: varchar("nome_responsavel", { length: 255 }),
  primeiroAcesso: smallint().default(1).notNull(),
  ativo: smallint().default(1).notNull(),
  ultimoLogin: timestamp("ultimo_login", { mode: "string" }),
  // JSON array de chaves de abas liberadas (Portal do Cliente — tela de planejamento por obra).
  // NULL = default (apenas visao_geral). Ver shared/portalClienteAbas.ts.
  abasLiberadas: text("abas_liberadas"),
  // Rev. 2851 — JSON array de IDs de OBRA que ESTA credencial pode ver.
  // NULL/ausente = TODAS as obras do cliente (backward compat). [] = nenhuma.
  // Whitelist por usuário — controle granular do acesso às obras do cliente.
  obrasLiberadas: text("obras_liberadas"),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
}, (table) => [
  index("pc_cnpj").on(table.cnpj),
  index("pc_tipo_empresa").on(table.tipo, table.empresaTerceiraId),
  index("pc_tipo_parceiro").on(table.tipo, table.parceiroId),
  index("pc_tipo_cliente").on(table.tipo, table.clienteId),
]);

// ============================================================
// PORTAL DO CLIENTE — Rev. 1424
// ============================================================

// Tokens de redefinição de senha (esqueci minha senha) — para todos os tipos do portal
export const portalPasswordResets = pgTable("portal_password_resets", {
  id: serial().primaryKey(),
  credId: integer("cred_id").notNull().references(() => portalCredentials.id, { onDelete: "cascade" }),
  token: varchar({ length: 128 }).notNull(),
  expiresAt: timestamp("expires_at", { mode: "string" }).notNull(),
  usadoEm: timestamp("usado_em", { mode: "string" }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("ppr_token").on(t.token),
  index("ppr_cred").on(t.credId),
]);

// Comentários cliente <-> empresa (NÃO anônimo — comunicação rastreável)
export const clienteComentarios = pgTable("cliente_comentarios", {
  id: serial().primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  clienteId: integer("cliente_id").notNull().references(() => clientes.id, { onDelete: "cascade" }),
  obraId: integer("obra_id").references(() => obras.id, { onDelete: "set null" }),
  autorTipo: varchar("autor_tipo", { length: 20 }).notNull(), // 'cliente' | 'fc'
  autorNome: varchar("autor_nome", { length: 255 }),
  mensagem: text().notNull(),
  lidoEm: timestamp("lido_em", { mode: "string" }),
  criadoEm: timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("clcom_company").on(t.companyId),
  index("clcom_cliente").on(t.clienteId),
  index("clcom_obra").on(t.obraId),
]);

// Avaliações ANÔNIMAS — pesquisa de satisfação (NPS)
// Não armazena clienteId/credId/IP — apenas obra (opcional) e companyId
export const clienteAvaliacoes = pgTable("cliente_avaliacoes", {
  id: serial().primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  obraId: integer("obra_id").references(() => obras.id, { onDelete: "set null" }),
  obraNome: varchar("obra_nome", { length: 255 }),
  // Notas 0-10 (NPS). null = não respondeu o critério
  notaEquipe: integer("nota_equipe"),
  notaObra: integer("nota_obra"),
  notaAtendimento: integer("nota_atendimento"),
  notaPrazo: integer("nota_prazo"),
  notaQualidade: integer("nota_qualidade"),
  notaGeral: integer("nota_geral"), // 0-10 — pergunta NPS
  // Rev. 1569 — perguntas adicionais (Empresa / Gestor)
  notaEmpresa: integer("nota_empresa"),
  notaGestor: integer("nota_gestor"),
  // Rev. 1592 — bloco Escritório Central (administrativo / faturamento)
  notaEscritorio: integer("nota_escritorio"),
  notaFaturamento: integer("nota_faturamento"),
  comentarioPositivo: text("comentario_positivo"),
  comentarioMelhoria: text("comentario_melhoria"),
  // Rev. 1569 — comentários por bloco
  comentarioEquipe: text("comentario_equipe"),
  comentarioEmpresa: text("comentario_empresa"),
  comentarioGestor: text("comentario_gestor"),
  // Rev. 1592 — comentário do bloco Escritório Central
  comentarioEscritorio: text("comentario_escritorio"),
  gestorNome: varchar("gestor_nome", { length: 255 }),
  recomendaria: smallint(), // 0=não, 1=talvez, 2=sim
  // Rev. 1569 — período da avaliação (YYYY-MM ou YYYY) e cancelamento pelo Master
  anoPeriodo: varchar("ano_periodo", { length: 7 }),
  canceladaEm: timestamp("cancelada_em", { mode: "string" }),
  canceladaPor: varchar("cancelada_por", { length: 255 }),
  // Rev. 2982 — tempo (em segundos) que o cliente levou para preencher a avaliação
  // (da abertura do formulário até o envio). Uso INTERNO p/ o Admin Master.
  tempoRespostaSegundos: integer("tempo_resposta_segundos"),
  criadoEm: timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("ca_company").on(t.companyId),
  index("ca_obra").on(t.obraId),
  index("ca_data").on(t.criadoEm),
]);

// Rev. 2965 — Detalhamento granular da avaliação (NPS) do Portal do Cliente.
// As colunas-resumo (notaGestor/notaEquipe/notaEscritorio/notaFaturamento) seguem
// fixas em cliente_avaliacoes p/ NÃO quebrar a analytics histórica; este registro
// guarda os critérios POR PESSOA/TEMA num único JSONB (gestor, encarregado, equipe
// direta, escritório central) — 1 linha por avaliação. Tabela NOVA (CREATE TABLE
// IF NOT EXISTS no self-heal), ZERO ALTER em cliente_avaliacoes.
export const clienteAvaliacaoDetalhes = pgTable("cliente_avaliacao_detalhes", {
  id: serial().primaryKey(),
  avaliacaoId: integer("avaliacao_id").notNull().references(() => clienteAvaliacoes.id, { onDelete: "cascade" }),
  companyId: integer("company_id").notNull(),
  dados: jsonb("dados"),
  criadoEm: timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("cad_aval").on(t.avaliacaoId),
  index("cad_company").on(t.companyId),
]);

// Rev. 1569 — Configuração do Portal do Cliente por empresa
// (periodicidade da avaliação anônima: mensal | anual)
export const portalClienteConfig = pgTable("portal_cliente_config", {
  companyId: integer("company_id").primaryKey().references(() => companies.id, { onDelete: "cascade" }),
  periodicidade: varchar("periodicidade", { length: 8 }).notNull().default("mensal"), // 'mensal' | 'anual'
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
});

// Rev. 1595 — Editor do Questionário do Portal do Cliente
// Perguntas EXTRAS (personalizadas) que o admin cria/edita/remove livremente.
// As 8 perguntas core (notaEquipe, notaGestor, notaEmpresa, notaObra,
// notaEscritorio, notaFaturamento, comentarioPositivo, comentarioMelhoria)
// permanecem fixas em cliente_avaliacoes para preservar a analytics histórica
// do NPS e a paridade Portal × Planejamento.
export const clientePerguntasExtras = pgTable("cliente_perguntas_extras", {
  id: serial().primaryKey(),
  companyId: integer("company_id").notNull(), // tenant isolation via WHERE companyId; companies não declara PK no schema
  ordem: integer().notNull().default(0),
  secaoTitulo: varchar("secao_titulo", { length: 80 }).notNull(), // agrupador visual ("Pós-obra", "Qualidade", etc.)
  tipo: varchar({ length: 20 }).notNull(), // 'nota_0_10' | 'texto_curto' | 'texto_longo' | 'sim_nao_talvez'
  label: varchar({ length: 240 }).notNull(),
  ajuda: text(),
  placeholder: varchar({ length: 240 }),
  obrigatoria: boolean().notNull().default(false),
  ativa: boolean().notNull().default(true),
  criadoEm: timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("cpe_company_ordem").on(t.companyId, t.ordem),
]);

// Rev. 1595 — Respostas das perguntas extras (uma linha por pergunta respondida)
// Mantém anonimato: sem clienteId/credId, herda apenas o vínculo com a avaliação anônima.
export const clienteRespostasExtras = pgTable("cliente_respostas_extras", {
  id: serial().primaryKey(),
  avaliacaoId: integer("avaliacao_id").notNull().references(() => clienteAvaliacoes.id, { onDelete: "cascade" }),
  perguntaId: integer("pergunta_id").notNull().references(() => clientePerguntasExtras.id, { onDelete: "cascade" }),
  valorNumero: integer("valor_numero"), // nota 0-10 ou recomendaria 0/1/2
  valorTexto: text("valor_texto"),       // texto curto/longo
}, (t) => [
  index("cre_aval").on(t.avaliacaoId),
  index("cre_pergunta").on(t.perguntaId),
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
        acessoTodasObras: smallint("acesso_todas_obras").default(0).notNull(),
        // Rev. 2207 — controla se o grupo pode ver o STATUS "Aviso Prévio"
        // do colaborador (sigilo sensível pedido pela Lilian). Default 0
        // (oculta) — somente admin_master e grupos onde este flag = 1
        // enxergam o badge real "Aviso Prévio"; demais veem "Ativo".
        // Substitui o regex hardcoded de nomes de grupo da Rev. 2206.
        verStatusAviso: smallint("ver_status_aviso").default(0).notNull(),
        moduleAccess: text("module_access"),
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
        aplicarDsrFalta: smallint().default(1).notNull(),
        aplicarDsrAtraso: smallint().default(1).notNull(),
        // Rev. 3989 — quando ativo, soma o líquido das diferenças salariais
        // retroativas do dissídio (relatorioDiferencas) no líquido da folha do mês.
        somarDiferencaDissidio: smallint().default(0).notNull(),
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
        valeResultJson: text(),
        pagamentoResultJson: text(),
        afericaoResultJson: text(),
        valeConsolidadoEm: timestamp({ mode: 'string' }),
        valeConsolidadoPor: varchar({ length: 255 }),
        heConsolidadoEm: timestamp({ mode: 'string' }),
        heConsolidadoPor: varchar({ length: 255 }),
        afericaoConsolidadoEm: timestamp({ mode: 'string' }),
        afericaoConsolidadoPor: varchar({ length: 255 }),
        pagamentoConsolidadoEm: timestamp({ mode: 'string' }),
        pagamentoConsolidadoPor: varchar({ length: 255 }),
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
        irRetidoAdiantamento: varchar({ length: 20 }).default('0'),
        valorLiquidoVale: varchar({ length: 20 }),
        // Rev. 3293 — arredondamento p/ R$ 1 com carry-forward. valorLiquidoVale passa
        // a guardar o valor PAGO (arredondado); o exato e o ajuste ficam aqui p/ auditoria.
        ajusteArredondamento: varchar({ length: 20 }).default('0'),
        valorLiquidoExato: varchar({ length: 20 }),
        bloqueado: smallint().default(0).notNull(),
        motivoBloqueio: text(),
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
        descontoSindicato: text().default('0'),
        descontoConvenio: text().default('0'),
        descontoOutros: varchar({ length: 20 }).default('0'),
        descontoOutrosDetalhes: json(),
        totalDescontos: varchar({ length: 20 }).notNull(),
        acertoEscuroValor: varchar({ length: 20 }).default('0'),
        acertoEscuroDetalhes: json(),
        descontosManuaisJson: json(),
        descontosManuaisHistorico: json(),
        salarioLiquido: varchar({ length: 20 }).notNull(),
        // Rev. 3293 — salarioLiquido passa a guardar o valor PAGO (arredondado p/ R$ 1
        // com carry-forward); o exato e o ajuste ficam aqui p/ auditoria do holerite.
        ajusteArredondamento: varchar({ length: 20 }).default('0'),
        salarioLiquidoExato: varchar({ length: 20 }),
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

// Rev. 3984 — Decisão "pagar ou não?" p/ funcionários cujo aviso prévio
// ENCERRA dentro do mês de referência (espelha o padrão de payroll_advances p/
// vale). Tabela dedicada (não payroll_payments, que é DELETE+INSERT a cada
// recálculo) para persistir a decisão do RH entre simulações.
export const payrollFolhaDecisoes = pgTable("payroll_folha_decisoes", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        mesReferencia: varchar({ length: 7 }).notNull(),
        decisao: varchar({ length: 20 }).notNull(), // 'pagar' | 'nao_pagar'
        motivo: varchar({ length: 50 }).default('aviso_encerrado_no_mes'),
        decididoPor: varchar({ length: 255 }),
        decididoEm: timestamp({ mode: 'string' }).defaultNow(),
        createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("pfd_company_mes").on(table.companyId, table.mesReferencia),
        index("pfd_employee_mes").on(table.employeeId, table.mesReferencia),
]);

// Rev. 3293 — Ledger de ARREDONDAMENTO p/ múltiplos de R$ 1 com CARRY-FORWARD.
// Cada evento de pagamento (vale OU folha mensal) paga o real inteiro mais próximo
// do líquido exato; o residual (±centavos) é o SALDO que carrega p/ o próximo evento
// do MESMO funcionário (vale→folha→vale...). Uma linha por (empresa, funcionário,
// origem, mês). NÃO vira lançamento; é trilha de auditoria. `ordem` = ((ano*12)+(mês-1))*2
// + (origem==='folha'?1:0) → garante vale(M) < folha(M) < vale(M+1).
export const payrollRoundingLedger = pgTable("payroll_rounding_ledger", {
        id: serial().notNull(),
        companyId: integer().notNull(),
        employeeId: integer().notNull(),
        origem: varchar({ length: 10 }).notNull(),        // 'vale' | 'folha'
        mesReferencia: varchar({ length: 7 }).notNull(),
        ordem: integer().notNull(),
        valorExato: varchar({ length: 20 }).notNull(),
        saldoAnterior: varchar({ length: 20 }).default('0').notNull(),
        ajusteAplicado: varchar({ length: 20 }).default('0').notNull(),
        valorPago: varchar({ length: 20 }).notNull(),
        residualGerado: varchar({ length: 20 }).default('0').notNull(),
        criadoEm: timestamp({ mode: 'string' }).defaultNow().notNull(),
        atualizadoEm: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        uniqueIndex("idx_prl_unique").on(table.companyId, table.employeeId, table.origem, table.mesReferencia),
        index("idx_prl_emp_ordem").on(table.companyId, table.employeeId, table.ordem),
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
        aprovadoRh: boolean().default(false),
        aprovadoRhPor: integer(),
        aprovadoRhEm: timestamp({ mode: 'string' }),
        aprovadoRhMotivo: text(),
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
        entrada1: varchar({ length: 10 }),
        saida1: varchar({ length: 10 }),
        entrada2: varchar({ length: 10 }),
        saida2: varchar({ length: 10 }),
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
        funcoesCobertasJson: text("funcoes_cobertas_json"),
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
        tabelasTotal: integer().default(0).notNull(),
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
  valorNegociado: numeric("valor_negociado", { precision: 18, scale: 2 }).default("0"),
  totalCusto: numeric({ precision: 18, scale: 2 }),
  totalMeta: numeric({ precision: 18, scale: 2 }),
  totalMateriais: numeric({ precision: 18, scale: 2 }),
  totalMdo: numeric({ precision: 18, scale: 2 }),
  totalEquipamentos: numeric({ precision: 18, scale: 2 }),
  status: text().default('rascunho'),
  metaAprovadaPor: varchar({ length: 255 }),
  metaAprovadaEm: timestamp({ mode: 'string' }),
  metaAprovadaUserId: integer(),
  metaPlanilhaCodigo: varchar("meta_planilha_codigo", { length: 255 }),
  metaPlanilhaImportadoEm: timestamp("meta_planilha_importado_em", { mode: 'string' }),
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
  custoUnitEquip: numeric("custo_unit_equip", { precision: 18, scale: 4 }),
  custoUnitTotal: numeric({ precision: 18, scale: 4 }),
  vendaUnitTotal: numeric({ precision: 18, scale: 4 }),
  metaUnitTotal: numeric({ precision: 18, scale: 4 }),
  metaUnitMat: numeric("meta_unit_mat", { precision: 18, scale: 4 }),
  metaUnitMdo: numeric("meta_unit_mdo", { precision: 18, scale: 4 }),
  metaUnitEquip: numeric("meta_unit_equip", { precision: 18, scale: 4 }),
  custoTotalMat: numeric({ precision: 18, scale: 2 }),
  custoTotalMdo: numeric({ precision: 18, scale: 2 }),
  custoTotalEquip: numeric("custo_total_equip", { precision: 18, scale: 2 }),
  custoTotal: numeric({ precision: 18, scale: 2 }),
  vendaTotal: numeric({ precision: 18, scale: 2 }),
  metaTotal: numeric({ precision: 18, scale: 2 }),
  metaTotalMat: numeric("meta_total_mat", { precision: 18, scale: 2 }),
  metaTotalMdo: numeric("meta_total_mdo", { precision: 18, scale: 2 }),
  metaTotalEquip: numeric("meta_total_equip", { precision: 18, scale: 2 }),
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

export const fdAjustes = pgTable("fd_ajustes", {
  id:            serial("id").primaryKey(),
  companyId:     integer("company_id").notNull(),
  orcamentoId:   integer("orcamento_id").notNull(),
  tipo:          varchar("tipo", { length: 20 }).notNull(),
  descricao:     text(),
  valorAnterior: numeric("valor_anterior", { precision: 14, scale: 2 }),
  valorNovo:     numeric("valor_novo", { precision: 14, scale: 2 }),
  justificativa: text().notNull(),
  adminId:       integer("admin_id").notNull(),
  adminNome:     varchar("admin_nome", { length: 255 }).notNull(),
  createdAt:     timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_fdajustes_orc").on(t.orcamentoId)]);

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
  alocacaoEquip: numeric("alocacao_equip", { precision: 18, scale: 6 }).default('0'),
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
  ultimaAnaliseJulinho:   text("ultima_analise_julinho"),
  analiseJulinhoData:     timestamp("analise_julinho_data"),
  analiseJulinhoSemana:   varchar("analise_julinho_semana", { length: 20 }),
  // ── Rev. 1637 — Data de Corte (Status Date / EVM) ──────────────────────
  // Última quinta-feira em que o cronograma foi formalmente atualizado pelo
  // engenheiro (procedimento interno semanal). Portal do Cliente e relatórios
  // externos SEMPRE usam essa data como denominador (PV/EV/SPI/atrasadas).
  // NULL = nunca fechado → cai automaticamente na última quinta ≤ today.
  dataCorteAtual:           date("data_corte_atual"),
  dataCorteAtualizadaEm:    timestamp("data_corte_atualizada_em"),
  dataCorteAtualizadaPor:   varchar("data_corte_atualizada_por", { length: 200 }),
  // ── Rev. 1642 — Calendário de trabalho importado do MS Project ─────────
  // JSON {weekDays:[bool×7 dom..sab], exceptions:[{from,to,working}]} usado
  // pelo helper `diasUteis()` para garantir paridade 100% Project × ERP.
  calendarioJson:           text("calendario_json"),
  // Rev. 1643 — StatusDate completo (ISO com hora) do MS Project. MSP grava
  // ex.: "2026-05-08T08:00:00" e essa hora muda o cálculo de % PREVISTO em
  // ~5pp por atividade. `dataCorteAtual` mantém só a data para compat.
  dataCorteIso:             text("data_corte_iso"),
  // ── Rev. 1647 — Dia da semana de cutoff (Status Date PMBOK/EVM) ────────
  // 0=Dom..6=Sáb. Define a janela COBRÁVEL da Programação Semanal: vai do
  // dia seguinte ao último cutoff até o próximo cutoff (ex.: dow=4/qui →
  // semana = sex→qui). Garante que PV e EV cobrem a mesma janela.
  // Default = 4 (quinta), padrão histórico FC. Quando `cutoffConsolidado`
  // é true, este valor é IMUTÁVEL (premissa congelada do projeto).
  diaCorteSemana:           integer("dia_corte_semana").default(4),
  cutoffConsolidado:        boolean("cutoff_consolidado").default(false),
  cutoffConsolidadoEm:      timestamp("cutoff_consolidado_em"),
  cutoffConsolidadoPor:     varchar("cutoff_consolidado_por", { length: 200 }),
  // Rev. 2533 — Caminho B: snapshot expandido do PREVISTO semana-a-semana.
  // JSON: { semanas: ["2026-05-07", ...], raiz: [0, 2, 5, ...],
  //         porAtividadeId: { "<id>": [0, 0, 5, ...] }, geradoEm: ISO }.
  // Gerado no salvarAtividades aplicando Int(((sem − BL_Start)/(BL_Finish −
  // BL_Start))*100) por atividade. SEMPRE a partir da MESMA coluna que o XML
  // semanal traz (PercentComplete) — só que via fórmula sobre baseline em vez
  // de leitura direta. Garante paridade matemática MSP×ERP em ambos momentos.
  previstoSemanasJson:      text("previsto_semanas_json"),
  previstoSemanasGeradoEm:  timestamp("previsto_semanas_gerado_em"),
  // Rev. 2633 — Modo MANUAL do "% Previsto": uploads crus por semana (1 XML por
  // semana, lendo PercentComplete). JSON: { revisaoId, semanas: { "YYYY-MM-DD":
  // { raiz, porAtividadeId: {"<id>": pct}, uploadedEm, arquivo } } }. O builder
  // `regenerarPrevistoManual` consome isto e produz `previsto_semanas_json` na
  // MESMA forma do motor — a tela continua lendo só a curva, sem saber a origem.
  previstoManualJson:       text("previsto_manual_json"),
  // Rev. 2767 — "% Previsto" LITERAL (Texto10 da raiz UID=0) capturado em CADA
  // upload semanal (aba Avanço), gravado por semana. JSON:
  //   { revisaoId: number, valores: { "<cutoffIso>": pct } }
  // É o número que o MS Project já calculou — paridade 100%. Guardado SEM
  // re-rodar o motor (zero oscilação). A curva `previsto_semanas_json` (motor)
  // segue projetando as semanas FUTURAS; o cliente só sobrepõe as semanas JÁ
  // enviadas. Chave = o cutoff (Quinta) da curva em que o StatusDate cai.
  previstoLiteralJson:      text("previsto_literal_json"),
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
  diferencas:   text("diferencas"),
  /** Rev. 1534 — Janela de Recovery Schedule (AACE 23R-02). Quantas semanas o
   * engenheiro escolheu pra diluir o débito acumulado em metas semanais
   * factíveis. Default 4. PV (baseline) permanece imutável; isto é apenas
   * a janela de cobrança gerencial. Visível também no Portal do Cliente. */
  recoveryWindowSemanas: integer("recovery_window_semanas").default(4),
  criadoEm:     timestamp("criado_em").defaultNow(),
});

export const planejamentoAtividades = pgTable("planejamento_atividades", {
  id:                   serial().primaryKey(),
  revisaoId:            integer("revisao_id").notNull(),
  projetoId:            integer("projeto_id").notNull(),
  eapCodigo:            varchar("eap_codigo", { length: 50 }),
  // Rev. 1829 — UID nativo do MS Project (campo <UID> de cada <Task> no XML).
  // Identidade ESTÁVEL da atividade entre revisões: o MSP preserva o UID quando
  // o usuário renomeia a tarefa, troca o WBS/Item, ou move ela na hierarquia.
  // Passa a ser a 1ª chave de matching nos imports/avanços (eap_codigo continua
  // como 2ª chave p/ casar com orçamento; fallback por nome FOI ELIMINADO —
  // renomear no MSP não quebra mais o histórico de avanços). Nullable porque
  // projetos legados (importados antes da Rev. 1829) ficam com null e caem no
  // fallback eap_codigo até serem reimportados do XML.
  mspUid:               varchar("msp_uid", { length: 20 }),
  nome:                 varchar({ length: 500 }).notNull(),
  nivel:                integer().default(1),
  dataInicio:           date("data_inicio"),
  dataFim:              date("data_fim"),
  dataInicioReal:       date("data_inicio_real"),
  dataFimReal:          date("data_fim_real"),
  // Rev. 1662 — Responsável editável (visão LOTUS). Default = engenheiro da obra,
  // mas pode ser sobrescrito por atividade (ex.: "Empresa Terceira X").
  responsavelLotus:     varchar("responsavel_lotus", { length: 200 }),
  duracaoDias:          integer("duracao_dias").default(0),
  predecessora:         varchar({ length: 100 }),
  pesoFinanceiro:       numeric("peso_financeiro", { precision: 10, scale: 4 }).default("0"),
  recursoPrincipal:     varchar("recurso_principal", { length: 200 }),
  quantidadePlanejada:  numeric("quantidade_planejada", { precision: 18, scale: 4 }).default("0"),
  unidade:              varchar({ length: 30 }),
  ordem:                integer().default(0),
  isGrupo:              boolean("is_grupo").default(false),
  isMarco:              boolean("is_marco").default(false),
  isIndireta:           boolean("is_indireta").default(false),
  // Rev. 1641 — Atividade externa (executada por terceiro fora do escopo da FC).
  // Conta normalmente no cronograma/Curva S/SPI, mas é destacada visualmente
  // como alerta e excluída dos KPIs de PPC/aderência (Last Planner).
  isExterna:            boolean("is_externa").default(false),
  externaResponsavel:   varchar("externa_responsavel", { length: 200 }),
  // Rev. 1670 — Snapshot do %PREVISTO (Texto10) e %REALIZADO AUX (Texto7) de
  // CADA atividade, lidos diretamente do XML do MS Project no momento do import.
  // Fonte: ExtendedAttribute FieldID 188743750 (Texto10, %PREVISTO 4 casas) e
  // 188743747 (Texto7, %Reali AUX). Permite paridade 100% Project × ERP sem
  // recalcular ProjDateDiff em JS — Curva S, Avanço Semanal e Programação
  // Semanal lerão estes campos quando disponíveis (fallback p/ cálculo
  // dinâmico nas atividades sem snapshot, ex.: cronograma legado).
  previstoMspPct:       numeric("previsto_msp_pct", { precision: 8, scale: 4 }),
  realizadoMspPct:      numeric("realizado_msp_pct", { precision: 8, scale: 4 }),
  // Rev. 2533 — Caminho B: BaselineStart/BaselineFinish lidos do MSP (tag
  // <Baseline Number="0">). Fonte ÚNICA do PREVISTO semana-a-semana, expandido
  // pela fórmula nativa Int(((semana − BL_Start)/(BL_Finish − BL_Start))*100)
  // no momento do salvarAtividades. Sem isso, cai no Start/Finish vigente
  // (baseline implícita = plano corrente).
  baselineStart:        date("baseline_start"),
  baselineFinish:       date("baseline_finish"),
  // Rev. 2617 — Caminho B (paridade EXATA %Concluída MSP): baseline COM HORA
  // (timestamp ISO bruto do XML, ex.: "2026-06-01T07:00:00"). A coluna DATE
  // acima perde a hora e produz divergência minuto-a-minuto (date-only dá
  // 2/9/16/22 vs o correto 2/9/15/20 no PLN_816 R04). text() preserva o
  // wall-clock pra o motor `minutosUteisEntre`. Fallback p/ baseline_start/finish.
  baselineStartTs:      text("baseline_start_ts"),
  baselineFinishTs:     text("baseline_finish_ts"),
  disabled:             boolean("disabled").default(false),
  // Rev. 1875 — Override granular de fim de semana trabalhado por atividade.
  // JSON array de datas ISO "YYYY-MM-DD" que devem ser tratadas como DIA ÚTIL
  // SÓ para esta atividade na Programação Semanal LOTUS, independente do
  // calendário MSP do projeto. Default null/[] = respeita estritamente o
  // `planejamento_projetos.calendario_json` (sem sáb/dom). O engenheiro
  // habilita pontualmente clicando na célula de sáb/dom da linha (toggle).
  diasTrabalhadosExtras: text("dias_trabalhados_extras"),
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
  sinalValor:        numeric("sinal_valor", { precision: 18, scale: 2 }).default("0"),
  fdValor:           numeric("fd_valor",   { precision: 18, scale: 2 }),
  retencaoPct:       numeric("retencao_pct", { precision: 10, scale: 2 }).default("5"),
  reterSinal:        boolean("reter_sinal").default(false),
  dataInicioObra:    date("data_inicio_obra"),
  dataPrimeiroFaturamento: date("data_primeiro_faturamento"),
  prazoRecebimentoDiasUteis: integer("prazo_recebimento_dias_uteis").default(15),
  // Rev. 1348: base de cálculo do SINAL/Mobilização — 'contrato' (padrão) ou 'mao_de_obra'.
  // Usado quando o cliente paga o sinal apenas sobre a parcela de mão de obra do contrato.
  sinalBase:         varchar("sinal_base", { length: 20 }).default("contrato"),
  valorParcelaFixa:  numeric("valor_parcela_fixa", { precision: 18, scale: 2 }).default("0"),
  bloqueado:         boolean("bloqueado").default(false),
  revisaoNumero:     integer("revisao_numero").default(0),
  revisadoPorNome:   varchar("revisado_por_nome", { length: 255 }),
  revisadoEm:        timestamp("revisado_em"),
  criadoEm:          timestamp("criado_em").defaultNow(),
  atualizadoEm:      timestamp("atualizado_em").defaultNow(),
});

// ========== MEDIÇÃO — PAINEL DE CONTROLE (por empresa) ==========
// Rev. 3078 — Governa o COMPORTAMENTO dos módulos "Medição de Cliente" (a receber)
// e "Medição de Terceiros" (a pagar). Ausência de linha = defaults permissivos.
// Colunas snake_case explícitas p/ casar com o self-heal [SyncSchema+].
export const medicaoConfig = pgTable("medicao_config", {
  id:                       serial().primaryKey(),
  companyId:                integer("company_id").notNull(),
  terceirosAtivo:           smallint("terceiros_ativo").default(1).notNull(),
  clienteAtivo:             smallint("cliente_ativo").default(1).notNull(),
  levantamentoObrigatorio:  smallint("levantamento_obrigatorio").default(1).notNull(),
  fotosObrigatorias:        smallint("fotos_obrigatorias").default(1).notNull(),
  aprovacaoTresNiveis:      smallint("aprovacao_tres_niveis").default(1).notNull(),
  divergenciaToleranciaPct: numeric("divergencia_tolerancia_pct", { precision: 6, scale: 2 }).default("5").notNull(),
  diaMedicaoPadrao:         integer("dia_medicao_padrao").default(25).notNull(),
  updatedBy:                varchar("updated_by", { length: 255 }),
  updatedAt:                timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  createdAt:                timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uniq_medicao_config_company").on(table.companyId),
]);

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

// Histórico persistido das análises de Efetivo × IA (diagnóstico + simulações).
// Aditiva (CREATE TABLE) — nunca ALTER/DROP/DELETE. `resultado` guarda o retorno
// completo da procedure (analise/previsao + contexto) p/ reabrir no histórico.
export const planejamentoAnalisesEfetivo = pgTable("planejamento_analises_efetivo", {
  id:            serial().primaryKey(),
  projetoId:     integer("projeto_id").notNull(),
  companyId:     integer("company_id"),
  tipo:          varchar({ length: 20 }).notNull(),          // 'diagnostico' | 'simulacao'
  veredito:      varchar({ length: 40 }),                     // diagnostico/veredito da IA
  titulo:        varchar({ length: 400 }),
  obra:          varchar({ length: 300 }),
  revisaoNumero: integer("revisao_numero"),
  resultado:     json("resultado").default({}),
  contexto:      json("contexto").default({}),
  erroIa:        text("erro_ia"),
  criadoPor:     varchar("criado_por", { length: 200 }),
  criadoEm:      timestamp("criado_em").defaultNow(),
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
  naturezaJuridica: varchar("natureza_juridica", { length: 255 }),
  porte:            varchar({ length: 100 }),
  capitalSocial:    varchar("capital_social", { length: 50 }),
  atividadePrincipal: varchar("atividade_principal", { length: 500 }),
  atividadesCnae:   text("atividades_cnae"),
  dataAbertura:     varchar("data_abertura", { length: 20 }),
  regimeTributario: varchar("regime_tributario", { length: 100 }),
  inscricaoEstadual: varchar("inscricao_estadual", { length: 30 }),
  inscricaoMunicipal: varchar("inscricao_municipal", { length: 30 }),
  representanteLegal: varchar("representante_legal", { length: 255 }),
  representanteCpf: varchar("representante_cpf", { length: 20 }),
  representanteCargo: varchar("representante_cargo", { length: 100 }),
  socios:           json().default([]),
  categorias:       json().default([]),
  ativo:            boolean().default(true),
  isPrestadorServico: boolean("is_prestador_servico").default(false),
  isFornecedor:     boolean("is_fornecedor").default(true),
  observacoes:      text(),
  criadoEm:         timestamp("criado_em", { mode: 'string' }).defaultNow().notNull(),
  atualizadoEm:     timestamp("atualizado_em", { mode: 'string' }).defaultNow().notNull(),
});

// Rev. 3454 — Cache persistente de análise IA da Conciliação Bancária.
// Evita re-análise cara a cada mount; usuário re-analisa explicitamente.
export const bankConciliationAiCache = pgTable("bank_conciliation_ai_cache", {
  id:               serial().primaryKey(),
  companyId:        integer("company_id").notNull(),
  contaBancariaId:  integer("conta_bancaria_id").notNull(),
  dataInicio:       varchar("data_inicio", { length: 10 }).notNull(),
  dataFim:          varchar("data_fim", { length: 10 }).notNull(),
  resultadosJson:   jsonb("resultados_json").notNull().default({}),
  analisadoEm:      timestamp("analisado_em", { mode: "string" }).defaultNow().notNull(),
});

export const clientes = pgTable("clientes", {
  id:               serial().primaryKey(),
  companyId:        integer("company_id").notNull(),
  tipo:             varchar({ length: 10 }).default("PJ").notNull(),
  cnpj:             varchar({ length: 18 }),
  cpf:              varchar({ length: 14 }),
  razaoSocial:      varchar("razao_social", { length: 255 }).notNull(),
  nomeFantasia:     varchar("nome_fantasia", { length: 255 }),
  logoUrl:          text("logo_url"),
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
  observacoes:                text(),
  ativo:                      boolean().default(true),
  // Rev. 3453 — dados PF (Pessoa Física)
  rg:                         varchar({ length: 20 }),
  orgaoEmissor:               varchar("orgao_emissor", { length: 30 }),
  dataNascimento:             date("data_nascimento", { mode: "string" }),
  estadoCivil:                varchar("estado_civil", { length: 20 }),
  sexo:                       varchar({ length: 10 }),
  profissao:                  varchar({ length: 100 }),
  nacionalidade:              varchar({ length: 50 }),
  integracaoRequer:           boolean("integracao_requer").default(false),
  integracaoDiasSemana:       varchar("integracao_dias_semana", { length: 50 }),
  integracaoDuracao:          varchar("integracao_duracao", { length: 50 }),
  integracaoValidadeMeses:    integer("integracao_validade_meses"),
  integracaoEmail:            varchar("integracao_email", { length: 255 }),
  integracaoPlataforma:       varchar("integracao_plataforma", { length: 255 }),
  integracaoProcedimento:     text("integracao_procedimento"),
  criadoEm:                   timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
  atualizadoEm:               timestamp("atualizado_em", { mode: "string" }).defaultNow().notNull(),
});

// Rev. 2606 — Cadastro reutilizável de Gerenciadoras (com logo) para agilizar
// novas obras. Espelha o padrão de `clientes`: o usuário cadastra uma vez
// (nome + logo + contatos) e reaproveita em qualquer obra futura, com o logo
// preenchido automaticamente ao selecionar. 100% aditivo (CREATE TABLE).
export const gerenciadoras = pgTable("gerenciadoras", {
  id:                serial().primaryKey(),
  companyId:         integer("company_id").notNull(),
  nome:              varchar({ length: 255 }).notNull(),
  logoUrl:           text("logo_url"),
  cnpj:              varchar({ length: 18 }),
  telefone:          varchar({ length: 20 }),
  email:             varchar({ length: 255 }),
  observacoes:       text(),
  // Rev. 2611 — dados puxados automaticamente da Receita (BrasilAPI) ao digitar o CNPJ
  razaoSocial:       text("razao_social"),
  nomeFantasia:      text("nome_fantasia"),
  endereco:          text(),
  bairro:            varchar({ length: 120 }),
  municipio:         varchar({ length: 120 }),
  uf:                varchar({ length: 2 }),
  cep:               varchar({ length: 10 }),
  situacaoCadastral: varchar("situacao_cadastral", { length: 60 }),
  socios:            json(),
  ativo:             boolean().default(true),
  criadoEm:          timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
  atualizadoEm:      timestamp("atualizado_em", { mode: "string" }).defaultNow().notNull(),
});

export const employeeIntegrations = pgTable("employee_integrations", {
  id:             serial().primaryKey(),
  companyId:      integer("company_id").notNull(),
  employeeId:     integer("employee_id").notNull(),
  tipo:           varchar({ length: 20 }).notNull().default("externa"),
  clienteId:      integer("cliente_id"),
  clienteNome:    varchar("cliente_nome", { length: 255 }),
  dataRealizacao: varchar("data_realizacao", { length: 10 }).notNull(),
  dataVencimento: varchar("data_vencimento", { length: 10 }),
  evidencia:      text(),
  observacoes:    text(),
  registradoPor:  integer("registrado_por"),
  criadoEm:       timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
  atualizadoEm:   timestamp("atualizado_em", { mode: "string" }).defaultNow().notNull(),
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

export const almoxarifadoUnidades = pgTable("almoxarifado_unidades", {
  id:        serial().primaryKey(),
  companyId: integer("company_id").notNull(),
  sigla:     varchar({ length: 20 }).notNull(),
  descricao: varchar({ length: 100 }),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const almoxarifadoItens = pgTable("almoxarifado_itens", {
  id:               serial().primaryKey(),
  companyId:        integer("company_id").notNull(),
  obraId:           integer("obra_id"),
  nome:             varchar({ length: 255 }).notNull(),
  unidade:          varchar({ length: 20 }).notNull().default("un"),
  categoria:        varchar({ length: 100 }),
  codigoInterno:    varchar("codigo_interno", { length: 50 }),
  quantidadeAtual:  numeric("quantidade_atual", { precision: 14, scale: 3 }).default("0"),
  quantidadeMinima: numeric("quantidade_minima", { precision: 14, scale: 3 }).default("0"),
  observacoes:      text(),
  // Rev. 4011 — Especificação técnica do material, separada do nome
  // (ex.: nome "Parafuso" + especificação "M8 x 40mm, aço inox").
  especificacao:    text("especificacao"),
  fotoUrl:               text("foto_url"),
  ativo:                 boolean().default(true),
  origem:                varchar({ length: 20 }).default("proprio"),
  fornecedorLocacao:     varchar("fornecedor_locacao", { length: 255 }),
  dataInicioLocacao:     varchar("data_inicio_locacao", { length: 10 }),
  dataVencimentoLocacao: varchar("data_vencimento_locacao", { length: 10 }),
  valorUnitario:         numeric("valor_unitario", { precision: 14, scale: 2 }),
  valorLocacaoMensal:    numeric("valor_locacao_mensal", { precision: 14, scale: 2 }),
  diasAlertaLocacao:     integer("dias_alerta_locacao").default(7),
  observacoesLocacao:    text("observacoes_locacao"),
  dataValidade:          varchar("data_validade", { length: 10 }),
  criadoPorId:           integer("criado_por_id"),
  criadoPorNome:         varchar("criado_por_nome", { length: 255 }),
  atualizadoPorId:       integer("atualizado_por_id"),
  atualizadoPorNome:     varchar("atualizado_por_nome", { length: 255 }),
  // Rev. 1604 — preço estimado por IA (preenchimento em lote a partir do nome)
  precoPreenchidoIa:     boolean("preco_preenchido_ia").default(false),
  precoIaEm:             timestamp("preco_ia_em", { mode: 'string' }),
  // Rev. 1607 — Tipo de controle do item (classificação automática por IA).
  // 'estoque' (padrão): controla saldo no almoxarifado normalmente.
  // 'aplicacao_direta': item recebido e aplicado na obra na mesma hora (ex.: concreto usinado,
  // argamassa pronta, asfalto). NÃO entra no estoque, NÃO aparece na lista normal do almoxarifado,
  // e o recebimento via OC gera movimentação "consumo direto" sem alterar saldo.
  tipoControle:               varchar("tipo_controle", { length: 20 }).default("estoque"),
  tipoControleClassificadoIa: boolean("tipo_controle_classificado_ia").default(false),
  tipoControleJustificativa:  text("tipo_controle_justificativa"),
  // Rev. 2404 — Vinculo do item de almoxarifado com Controle de Equipamentos.
  equipamentoVinculadoTipo:   varchar("equipamento_vinculado_tipo", { length: 10 }),
  equipamentoVinculadoId:     integer("equipamento_vinculado_id"),
  equipamentoVinculadoEm:     timestamp("equipamento_vinculado_em", { mode: 'string' }),
  criadoEm:             timestamp("criado_em", { mode: 'string' }).defaultNow().notNull(),
  atualizadoEm:         timestamp("atualizado_em", { mode: 'string' }).defaultNow().notNull(),
});

export const almoxarifadoMovimentacoes = pgTable("almoxarifado_movimentacoes", {
  id:                 serial().primaryKey(),
  companyId:          integer("company_id").notNull(),
  itemId:             integer("item_id").notNull(),
  tipo:               varchar({ length: 20 }).notNull(),
  quantidade:         numeric({ precision: 14, scale: 3 }).notNull(),
  obraId:             integer("obra_id"),
  obraNome:           varchar("obra_nome", { length: 255 }),
  motivo:             text(),
  usuarioId:          integer("usuario_id"),
  usuarioNome:        varchar("usuario_nome", { length: 255 }),
  observacoes:        text(),
  criadoEm:           timestamp("criado_em", { mode: 'string' }).defaultNow().notNull(),
  // Rev. 2305 — Estorno (soft-delete auditável). Quando preenchidas, a
  // movimentação foi REVERTIDA: estoque devolvido ao estado anterior,
  // mas o registro permanece no histórico com badge ESTORNADA.
  estornadaEm:        timestamp("estornada_em", { mode: 'string' }),
  estornadaPorId:     integer("estornada_por_id"),
  estornadaPorNome:   varchar("estornada_por_nome", { length: 255 }),
  estornoMotivo:      text("estorno_motivo"),
});

// ═══════════════════════════════════════════════════════════════════════════════
// Rev. 2373 — INVENTÁRIO VISUAL DE BAIAS (insumos a granel: areia, pedra, lajota)
// ═══════════════════════════════════════════════════════════════════════════════
// Operador de obra (4ª série) abre a tela "Inventário Visual", olha a baia
// física e toca em UM de 5 botões grandes (VAZIA / 1/4 / METADE / 3/4 / CHEIA).
// Foto opcional. Cada leitura vira histórico, e o card mostra a última leitura
// + tendência (subiu/desceu desde a leitura anterior).
// Não mexe em saldo de estoque (granel costuma estar em `aplicacao_direta`).
export const almoxarifadoBaias = pgTable("almoxarifado_baias", {
  id:                 serial().primaryKey(),
  companyId:          integer("company_id").notNull(),
  obraId:             integer("obra_id").notNull(),
  itemId:             integer("item_id"),  // opcional: liga a almoxarifado_itens (rastreia consumo se quiser)
  nome:               varchar({ length: 200 }).notNull(),  // "Baia areia média (lado esquerdo)"
  material:           varchar({ length: 100 }).notNull(),  // "areia", "brita 0", "lajota cerâmica", ...
  unidade:            varchar({ length: 20 }).notNull().default("m³"),
  capacidadeEstimada: numeric("capacidade_estimada", { precision: 14, scale: 3 }),
  fotoUrl:            text("foto_url"),
  observacoes:        text(),
  ativo:              boolean().default(true),
  criadoPorId:        integer("criado_por_id"),
  criadoPorNome:      varchar("criado_por_nome", { length: 255 }),
  criadoEm:           timestamp("criado_em", { mode: 'string' }).defaultNow().notNull(),
  atualizadoEm:       timestamp("atualizado_em", { mode: 'string' }).defaultNow().notNull(),
});

export const almoxarifadoBaiaLeituras = pgTable("almoxarifado_baia_leituras", {
  id:          serial().primaryKey(),
  companyId:   integer("company_id").notNull(),
  baiaId:      integer("baia_id").notNull(),
  percentual:  integer().notNull(),  // 0, 25, 50, 75, 100 (legado Rev. 2373)
  // Rev. 2417 — VOLUME ESTIMADO em m³/un (digitado pelo almoxarife).
  // Substitui o "feeling" dos 5 níveis. Permite calcular consumo do dia
  // = saldoAnteriorVolume + entradaHoje - saldoAtualVolume.
  volumeEstimado: numeric("volume_estimado", { precision: 14, scale: 3 }),
  fotoUrl:     text("foto_url"),
  observacoes: text(),
  lidaPorId:   integer("lida_por_id"),
  lidaPorNome: varchar("lida_por_nome", { length: 255 }),
  lidaEm:      timestamp("lida_em", { mode: 'string' }).defaultNow().notNull(),
  // Rev. 2422 — vínculo com a movimentação de saída gerada (se houver),
  // pra permitir "Desfazer aferição" com estorno limpo do almox.
  movimentacaoId: integer("movimentacao_id"),
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
  aprovadorNome:    varchar("aprovador_nome", { length: 255 }),
  aprovadoEm:       timestamp("aprovado_em", { mode: "string" }),
  tipo:             varchar({ length: 20 }).default("material"),
  incluirEquipamentos: boolean("incluir_equipamentos").default(false),
  // Rev. 2290 — Locação na SC (engenheiro indica já na solicitação,
  // suprimentos cota sabendo que é aluguel + período).
  isLocacao:        boolean("is_locacao").default(false),
  locacaoDuracaoDias: integer("locacao_duracao_dias"),
  locacaoDataInicioPrevista: varchar("locacao_data_inicio_prevista", { length: 10 }),
  locacaoDataFimPrevista:    varchar("locacao_data_fim_prevista", { length: 10 }),
  observacoes:      text(),
  imagemReferenciaUrl: text("imagem_referencia_url"),
  anexos:             json().default([]),
  vehicleId:        integer("vehicle_id"),
  maintenanceId:    integer("maintenance_id"),
  origemModulo:     varchar("origem_modulo", { length: 30 }),
  criadoPorId:      integer("criado_por_id"),
  criadoPorNome:    varchar("criado_por_nome", { length: 255 }),
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
  orcamentoItemId:    integer("orcamento_item_id"),
  eapCodigo:          varchar("eap_codigo", { length: 50 }),
  insumoCodigo:       varchar("insumo_codigo", { length: 100 }),
  composicaoCodigo:   varchar("composicao_codigo", { length: 100 }),
  precoMeta:          numeric("preco_meta", { precision: 18, scale: 4 }).default("0"),
  quantidadeServico:  numeric("quantidade_servico", { precision: 14, scale: 4 }),
  coeficiente:        numeric({ precision: 18, scale: 6 }),
  origemEap:          boolean("origem_eap").default(false),
  semVerba:           boolean("sem_verba").default(false),
  motivoSemVerba:     varchar("motivo_sem_verba", { length: 50 }),
  incluirAjudante:    boolean("incluir_ajudante").default(true),
  metaMdoProfissional: numeric("meta_mdo_profissional", { precision: 18, scale: 4 }).default("0"),
  metaMdoAjudante:    numeric("meta_mdo_ajudante", { precision: 18, scale: 4 }).default("0"),
  // Rev. 4243 — flag por item: indicar que somente mão de obra deve ser cotada (não o material).
  somenteMo:          boolean("somente_mo").default(false),
});

export const comprasCotacoes = pgTable("compras_cotacoes", {
  id:               serial().primaryKey(),
  companyId:        integer("company_id").notNull(),
  numeroCotacao:    varchar("numero_cotacao", { length: 20 }).notNull(),
  solicitacaoId:    integer("solicitacao_id"),
  divididaDeId:     integer("dividida_de_id"),
  obraId:           integer("obra_id"),
  fornecedorId:     integer("fornecedor_id"),
  descricao:        varchar({ length: 200 }),
  prioridade:       varchar({ length: 20 }).default("normal"),
  dataValidade:     date("data_validade", { mode: "string" }),
  condicaoPagamento:varchar("condicao_pagamento", { length: 100 }),
  tipoPagamento:    varchar("tipo_pagamento", { length: 50 }),
  formaPagamento:   varchar("forma_pagamento", { length: 30 }),
  // Rev. 4019 — cartão de crédito escolhido/sugerido quando formaPagamento='cartao'.
  cartaoId:         integer("cartao_id"),
  numeroParcelas:   integer("numero_parcelas").default(1),
  prazoEntregaDias: integer("prazo_entrega_dias"),
  status:           varchar({ length: 30 }).notNull().default("pendente"),
  observacoes:      text(),
  total:            numeric({ precision: 14, scale: 2 }).default("0"),
  tipo:             varchar({ length: 30 }).default("material"),
  contratoTerceiroId: integer("contrato_terceiro_id"),
  modalidadeFd:     varchar("modalidade_fd", { length: 20 }).default("normal"),
  fdValor:          numeric("fd_valor", { precision: 14, scale: 2 }),
  fdPagador:        varchar("fd_pagador", { length: 20 }),
  fdBdiItemId:      integer("fd_bdi_item_id"),
  // Rev. 4013 — quem assume o custo/risco deste item na equalização,
  // aplicável a obras "Fornecimento de MDO" (gestão de material).
  // 'empresa_com_risco' (padrão, comportamento de sempre) | 'empresa_sem_risco' (FC paga, mas é repasse, sem risco/BDI) | 'cliente_paga' (Faturamento Direto)
  regimeCusto:      varchar("regime_custo", { length: 20 }).default("empresa_com_risco"),
  criadoPorId:      integer("criado_por_id"),
  criadoPorNome:    varchar("criado_por_nome", { length: 255 }),
  aprovadoPorId:    integer("aprovado_por_id"),
  aprovadoPorNome:  varchar("aprovado_por_nome", { length: 255 }),
  aprovadoEm:       timestamp("aprovado_em", { mode: "string" }),
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
  semVerba:         boolean("sem_verba").default(false),
  motivoSemVerba:   varchar("motivo_sem_verba", { length: 50 }),
  // Rev. 4243 — propagado do item de SC: só mão de obra cotada para este item.
  somenteMo:        boolean("somente_mo").default(false),
  // Rev. 4255 — item pausado: não entra na cotação dos fornecedores mas permanece no mapa para referência.
  pausado:          boolean("pausado").default(false),
});

export const comprasCotacaoFornecedores = pgTable("compras_cotacao_fornecedores", {
  id:               serial().primaryKey(),
  cotacaoId:        integer("cotacao_id").notNull(),
  fornecedorId:     integer("fornecedor_id").notNull(),
  prazoEntregaDias: integer("prazo_entrega_dias"),
  condicaoPagamento:varchar("condicao_pagamento", { length: 100 }),
  tipoPagamento:    varchar("tipo_pagamento", { length: 50 }),
  formaPagamento:   varchar("forma_pagamento", { length: 30 }),
  numeroParcelas:   integer("numero_parcelas"),
  observacoes:      text(),
  totalOrcado:      numeric("total_orcado", { precision: 14, scale: 2 }).default("0"),
  selecionado:      boolean().default(false),
  arquivoUrl:       varchar("arquivo_url", { length: 500 }),
  arquivoNome:      varchar("arquivo_nome", { length: 255 }),
  freteTipo:        varchar("frete_tipo", { length: 10 }).default("cif"),
  valorFrete:       numeric("valor_frete", { precision: 14, scale: 2 }).default("0"),
  transportadora:   varchar("transportadora", { length: 255 }),
  moduloMedicao:    varchar("modulo_medicao", { length: 30 }),
  isEstoque:        boolean("is_estoque").default(false),
  almoxarifadoOrigemId: integer("almoxarifado_origem_id"),
  cartaoId:         integer("cartao_id"),
  // Rev. 4073 — marca que a condição de pagamento desta cotação-fornecedor foi
  // definida manualmente pelo comprador, fugindo do ciclo de fechamento cadastrado
  // (ou da regra especial por produto) do fornecedor. Fica visível/rastreável.
  excecaoManual:    boolean("excecao_manual").default(false),
  // Rev. 4284 — Adiantamento (sinal) e Retenção de Garantia por contrato de medição.
  adiantamentoAtivo:      boolean("adiantamento_ativo").default(false),
  adiantamentoTipo:       varchar("adiantamento_tipo", { length: 10 }).default("pct"),
  adiantamentoPct:        numeric("adiantamento_pct", { precision: 5, scale: 2 }).default("5.00"),
  adiantamentoValorFixo:  numeric("adiantamento_valor_fixo", { precision: 14, scale: 2 }),
  adiantamentoPrazoDias:  integer("adiantamento_prazo_dias").default(7),
  adiantamentoAmortizacao: varchar("adiantamento_amortizacao", { length: 20 }).default("proporcional"),
  adiantamentoParcelasN:  integer("adiantamento_parcelas_n").default(1),
  retencaoAtiva:          boolean("retencao_ativa").default(false),
  retencaoPct:            numeric("retencao_pct", { precision: 5, scale: 2 }).default("5.00"),
  retencaoLiberacao:      varchar("retencao_liberacao", { length: 10 }).default("final"),
  criadoEm:         timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
});

export const comprasCotacaoRespostas = pgTable("compras_cotacao_respostas", {
  id:            serial().primaryKey(),
  cotacaoId:     integer("cotacao_id").notNull(),
  fornecedorId:  integer("fornecedor_id").notNull(),
  itemId:        integer("item_id").notNull(),
  propostaId:    integer("proposta_id"),
  quantidade:    numeric("quantidade", { precision: 14, scale: 4 }).default("0"),
  precoUnitario: numeric("preco_unitario", { precision: 14, scale: 4 }).default("0"),
  descontoPct:   numeric("desconto_pct", { precision: 5, scale: 2 }).default("0"),
  total:         numeric({ precision: 14, scale: 2 }).default("0"),
  totalMat:      numeric("total_mat", { precision: 18, scale: 2 }),
  totalMdo:      numeric("total_mdo", { precision: 18, scale: 2 }),
  observacoes:   text(),
});

export const comprasCotacaoPropostas = pgTable("compras_cotacao_propostas", {
  id:            serial().primaryKey(),
  cotacaoId:     integer("cotacao_id").notNull(),
  fornecedorId:  integer("fornecedor_id").notNull(),
  companyId:     integer("company_id").notNull(),
  fileName:      varchar("file_name", { length: 500 }),
  tipo:          varchar("tipo", { length: 20 }).default("complemento"),
  status:        varchar("status", { length: 20 }).default("ativa"),
  substituiPropostaId: integer("substitui_proposta_id"),
  itensExtraidos: integer("itens_extraidos").default(0),
  itensComMatch:  integer("itens_com_match").default(0),
  condicaoPagamento: varchar("condicao_pagamento", { length: 200 }),
  prazoEntrega:    varchar("prazo_entrega", { length: 200 }),
  observacoesIa:   text("observacoes_ia"),
  criadoEm:      timestamp("criado_em").defaultNow(),
});

export const comprasCondicoesPagamento = pgTable("compras_condicoes_pagamento", {
  id:        serial().primaryKey(),
  companyId: integer("company_id").notNull(),
  descricao: varchar("descricao", { length: 150 }).notNull(),
  ativo:     boolean("ativo").default(true),
  ordem:     integer("ordem").default(0),
  criadoEm: timestamp("criado_em").defaultNow(),
});

export const comprasOrdens = pgTable("compras_ordens", {
  id:                 serial().primaryKey(),
  companyId:          integer("company_id").notNull(),
  numeroOc:           varchar("numero_oc", { length: 20 }).notNull(),
  cotacaoId:          integer("cotacao_id"),
  obraId:             integer("obra_id"),
  fornecedorId:       integer("fornecedor_id"),
  fornecedorNome:     varchar("fornecedor_nome", { length: 255 }),
  solicitanteId:      integer("solicitante_id"),
  dataEntregaPrevista:varchar("data_entrega_prevista", { length: 10 }),
  dataEntregaReal:    varchar("data_entrega_real", { length: 10 }),
  dataVencimento:     varchar("data_vencimento", { length: 10 }),
  financialEntryId:   integer("financial_entry_id"),
  tipoPagamento:      varchar("tipo_pagamento", { length: 50 }),
  formaPagamento:     varchar("forma_pagamento", { length: 30 }),
  // Rev. 4019 — cartão de crédito escolhido/sugerido quando formaPagamento='cartao'.
  cartaoId:           integer("cartao_id"),
  // Rev. 4284 — Adiantamento e Retenção de Garantia herdados da cotação vencedora.
  adiantamentoAtivo:      boolean("adiantamento_ativo").default(false),
  adiantamentoTipo:       varchar("adiantamento_tipo", { length: 10 }).default("pct"),
  adiantamentoPct:        numeric("adiantamento_pct", { precision: 5, scale: 2 }).default("5.00"),
  adiantamentoValorFixo:  numeric("adiantamento_valor_fixo", { precision: 14, scale: 2 }),
  adiantamentoPrazoDias:  integer("adiantamento_prazo_dias").default(7),
  adiantamentoAmortizacao: varchar("adiantamento_amortizacao", { length: 20 }).default("proporcional"),
  adiantamentoParcelasN:  integer("adiantamento_parcelas_n").default(1),
  retencaoAtiva:          boolean("retencao_ativa").default(false),
  retencaoPct:            numeric("retencao_pct", { precision: 5, scale: 2 }).default("5.00"),
  retencaoLiberacao:      varchar("retencao_liberacao", { length: 10 }).default("final"),
  numeroParcelas:     integer("numero_parcelas").default(1),
  parcelasJson:       jsonb("parcelas_json"),
  contaBancariaId:    integer("conta_bancaria_id"),
  status:             varchar({ length: 30 }).notNull().default("pendente"),
  aprovacaoStatus:    varchar("aprovacao_status", { length: 30 }).default("aguardando"),
  aprovadorId:        integer("aprovador_id"),
  aprovadorNome:      varchar("aprovador_nome", { length: 255 }),
  aprovadoEm:         timestamp("aprovado_em", { mode: "string" }),
  subtotal:           numeric({ precision: 14, scale: 2 }).default("0"),
  frete:              numeric({ precision: 14, scale: 2 }).default("0"),
  freteTipo:          varchar("frete_tipo", { length: 10 }).default("cif"),
  transportadora:     varchar({ length: 200 }),
  codigoRastreamento: varchar("codigo_rastreamento", { length: 200 }),
  outrasDespesas:     numeric("outras_despesas", { precision: 14, scale: 2 }).default("0"),
  impostos:           numeric({ precision: 14, scale: 2 }).default("0"),
  desconto:           numeric({ precision: 14, scale: 2 }).default("0"),
  total:              numeric({ precision: 14, scale: 2 }).default("0"),
  numeroNf:           varchar("numero_nf", { length: 100 }),
  condicaoPagamento:  varchar("condicao_pagamento", { length: 100 }),
  solicitacaoId:      integer("solicitacao_id"),
  observacoes:        text(),
  anexos:             jsonb("anexos"),
  pdfUrl:             text("pdf_url"),
  pendenteCoberturaOrcamentaria: boolean("pendente_cobertura_orcamentaria").default(false),
  aprovacaoExtraRequerida: boolean("aprovacao_extra_requerida").default(false),
  aprovacaoExtraAdminId: integer("aprovacao_extra_admin_id"),
  aprovacaoExtraAdminNome: varchar("aprovacao_extra_admin_nome", { length: 255 }),
  aprovacaoExtraJustificativa: text("aprovacao_extra_justificativa"),
  aprovacaoExtraEm: timestamp("aprovacao_extra_em", { mode: "string" }),
  aprovacaoExtraMotivo: text("aprovacao_extra_motivo"),
  tipo:               varchar({ length: 20 }).default("compra"),
  contratoId:         integer("contrato_id"),
  modalidadeFd:       varchar("modalidade_fd", { length: 20 }).default("normal"),
  fdValor:            numeric("fd_valor", { precision: 14, scale: 2 }),
  fdStatus:           varchar("fd_status", { length: 30 }),
  fdAprovadoEm:       timestamp("fd_aprovado_em", { mode: "string" }),
  fdAprovadoPor:      varchar("fd_aprovado_por", { length: 255 }),
  fdBdiItemId:        integer("fd_bdi_item_id"),
  // Rev. 4013 — herdado da cotação: quem assume o custo/risco desta OC.
  regimeCusto:        varchar("regime_custo", { length: 20 }).default("empresa_com_risco"),
  vehicleId:          integer("vehicle_id"),
  maintenanceId:      integer("maintenance_id"),
  criadoPorId:        integer("criado_por_id"),
  criadoPorNome:      varchar("criado_por_nome", { length: 255 }),
  criadoEm:           timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  atualizadoEm:       timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  // === Locação de equipamento (Rev. 2256) ===
  isLocacao:             boolean("is_locacao").default(false),
  locacaoDataInicio:     varchar("locacao_data_inicio", { length: 10 }),
  locacaoDataFim:        varchar("locacao_data_fim", { length: 10 }),
  locacaoDuracaoDias:    integer("locacao_duracao_dias"),
  locacaoRenovavel:      boolean("locacao_renovavel").default(false),
  locacaoOcAnteriorId:   integer("locacao_oc_anterior_id"),
  locacaoSolicitacaoId:  integer("locacao_solicitacao_id"),
  // === Cancelamento por admin master (Rev. 2909) ===
  canceladoPor:          varchar("cancelado_por", { length: 255 }),
  canceladoEm:           timestamp("cancelado_em", { mode: "string" }),
  motivoCancelamento:    text("motivo_cancelamento"),
});

export const comprasOrdensItens = pgTable("compras_ordens_itens", {
  id:               serial().primaryKey(),
  ordemId:          integer("ordem_id").notNull(),
  solicitacaoItemId:integer("solicitacao_item_id"),
  cotacaoItemId:    integer("cotacao_item_id"),
  insumoCodigo:     varchar("insumo_codigo", { length: 100 }),
  descricao:        varchar({ length: 300 }).notNull(),
  unidade:          varchar({ length: 30 }),
  quantidade:       numeric({ precision: 10, scale: 3 }).notNull().default("1"),
  quantidadeEntregue:numeric("quantidade_entregue", { precision: 10, scale: 3 }).default("0"),
  precoUnitario:    numeric("preco_unitario", { precision: 14, scale: 4 }).default("0"),
  total:            numeric({ precision: 14, scale: 2 }).default("0"),
});

export const comprasEntregasProgramadas = pgTable("compras_entregas_programadas", {
  id:               serial().primaryKey(),
  ordemItemId:      integer("ordem_item_id").notNull(),
  dataEntrega:      varchar("data_entrega", { length: 10 }).notNull(),
  quantidade:       numeric({ precision: 10, scale: 3 }).notNull().default("0"),
  quantidadeEntregue: numeric("quantidade_entregue", { precision: 10, scale: 3 }).default("0"),
  status:           varchar({ length: 30 }).notNull().default("pendente"),
  observacoes:      text(),
  criadoEm:         timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
});

// ── Alocação MO: configuração de cargos ──────────────────────
export const cargoCategoriasCusto = pgTable("cargo_categorias_custo", {
  id:          serial().primaryKey(),
  companyId:   integer("company_id").notNull(),
  cargo:       varchar({ length: 150 }).notNull(),
  categoria:   varchar({ length: 30 }).notNull(), // 'direto' | 'indireta_obra' | 'escritorio_central'
  criadoEm:    timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
});

export const folhaMoTransferencias = pgTable("folha_mo_transferencias", {
  id:             serial().primaryKey(),
  companyId:      integer("company_id").notNull(),
  mesReferencia:  varchar("mes_referencia", { length: 7 }).notNull(),
  executadoEm:    timestamp("executado_em", { mode: "string" }).defaultNow().notNull(),
  executadoPor:   varchar("executado_por", { length: 255 }),
  totalDireto:    numeric("total_direto", { precision: 14, scale: 2 }).default("0"),
  totalIndireto:  numeric("total_indireto", { precision: 14, scale: 2 }).default("0"),
  totalCentral:   numeric("total_central", { precision: 14, scale: 2 }).default("0"),
  detalhes:       json("detalhes"),
});

export const planejamentoCustosMo = pgTable("planejamento_custos_mo", {
  id:              serial().primaryKey(),
  projetoId:       integer("projeto_id").notNull(),
  atividadeId:     integer("atividade_id"),
  mesReferencia:   varchar("mes_referencia", { length: 7 }).notNull(),
  tipo:            varchar({ length: 30 }).notNull(), // 'direto' | 'indireta_01_01' | 'ci01_central'
  custo:           numeric({ precision: 14, scale: 2 }).notNull().default("0"),
  descricao:       text(),
  transferenciaId: integer("transferencia_id"),
  criadoEm:        timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
});

export const comprasRiscoDebitos = pgTable("compras_risco_debitos", {
  id:          serial().primaryKey(),
  companyId:   integer("company_id").notNull(),
  obraId:      integer("obra_id"),
  orcamentoId: integer("orcamento_id"),
  cotacaoId:   integer("cotacao_id"),
  valor:       numeric({ precision: 14, scale: 2 }).notNull(),
  observacao:  text(),
  criadoEm:    timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
});

// ============================================================
// RESERVAS DE SALDO + TRAVAMENTO PROGRESSIVO (Rev. 1386)
// Reserva preventiva de DI-08/Economia quando uma cotação fecha
// com déficit. Se não resolver em 7 dias, novas cotações
// deficitárias ficam bloqueadas para a equipe de compras.
// ============================================================
export const comprasReservasSaldo = pgTable("compras_reservas_saldo", {
  id:                       serial().primaryKey(),
  companyId:                integer("company_id").notNull(),
  obraId:                   integer("obra_id"),
  cotacaoId:                integer("cotacao_id"),
  ordemId:                  integer("ordem_id"),
  responsavelOriginalId:    integer("responsavel_original_id"),
  responsavelOriginalNome:  varchar("responsavel_original_nome", { length: 255 }),
  valorDi08Reservado:       numeric("valor_di08_reservado", { precision: 14, scale: 2 }).notNull().default("0"),
  valorEconomiaReservada:   numeric("valor_economia_reservada", { precision: 14, scale: 2 }).notNull().default("0"),
  prazoLimite:              timestamp("prazo_limite", { mode: "string" }).notNull(),
  status:                   varchar({ length: 20 }).notNull().default("ativa"), // ativa | consumida | liberada | expirada
  motivo:                   text(),
  criadoEm:                 timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
  atualizadoEm:             timestamp("atualizado_em", { mode: "string" }).defaultNow().notNull(),
}, (table) => [
  index("crs_company").on(table.companyId),
  index("crs_obra").on(table.obraId),
  index("crs_cotacao").on(table.cotacaoId),
  index("crs_status").on(table.status),
  index("crs_responsavel").on(table.responsavelOriginalId),
]);

export const comprasReservasLog = pgTable("compras_reservas_log", {
  id:                serial().primaryKey(),
  companyId:         integer("company_id").notNull(),
  reservaId:         integer("reserva_id").notNull(),
  acao:              varchar({ length: 30 }).notNull(), // criada | estendida | transferida | consumida | liberada | expirada | sc_emergencia | override_master
  executadoPorId:    integer("executado_por_id"),
  executadoPorNome:  varchar("executado_por_nome", { length: 255 }),
  prazoAdicionalDias:integer("prazo_adicional_dias"),
  motivo:            text(),
  valorImpactado:    numeric("valor_impactado", { precision: 14, scale: 2 }),
  detalhes:          text(),
  criadoEm:          timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
}, (table) => [
  index("crl_company").on(table.companyId),
  index("crl_reserva").on(table.reservaId),
  index("crl_acao").on(table.acao),
]);

// ============================================================
// MÓDULO ALMOXARIFADO — WAREHOUSE (adicionado Rev. 297)
// Usa almoxarifado_itens e almoxarifado_movimentacoes existentes.
// Novas tabelas: empréstimos e inventário semanal.
// ============================================================

export const almoxarifadoDescontoFolha = pgTable("almoxarifado_desconto_folha", {
  id:               serial().primaryKey(),
  companyId:        integer("company_id").notNull(),
  employeeId:       integer("employee_id").notNull(),
  employeeNome:     varchar("employee_nome", { length: 255 }).notNull(),
  loanId:           integer("loan_id"),
  itemNome:         varchar("item_nome", { length: 255 }).notNull(),
  quantidade:       numeric({ precision: 10, scale: 3 }).default("1"),
  valorDesconto:    numeric("valor_desconto", { precision: 14, scale: 2 }).notNull(),
  descricao:        text(),
  status:           varchar({ length: 20 }).notNull().default("pendente"),
  aprovadoPor:      varchar("aprovado_por", { length: 255 }),
  aprovadoEm:       timestamp("aprovado_em", { mode: "string" }),
  motivoReprovacao: text("motivo_reprovacao"),
  mesDesconto:      varchar("mes_desconto", { length: 7 }),
  criadoPor:        varchar("criado_por", { length: 255 }),
  criadoEm:         timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
});

export const warehouseLoans = pgTable("warehouse_loans", {
  id:               serial().primaryKey(),
  companyId:        integer("company_id").notNull(),
  obraId:           integer("obra_id"),
  itemId:           integer("item_id").notNull(),
  itemNome:         varchar("item_nome", { length: 255 }).notNull(),
  quantidade:       numeric({ precision: 10, scale: 3 }).notNull().default("1"),
  funcionarioId:    integer("funcionario_id"),
  funcionarioCodigo:varchar("funcionario_codigo", { length: 20 }),
  funcionarioNome:  varchar("funcionario_nome", { length: 255 }).notNull(),
  dataEmprestimo:   varchar("data_emprestimo", { length: 10 }).notNull(),
  horaEmprestimo:   varchar("hora_emprestimo", { length: 5 }),
  dataDevolucao:    varchar("data_devolucao", { length: 10 }),
  horaDevolucao:    varchar("hora_devolucao", { length: 5 }),
  status:           varchar({ length: 20 }).notNull().default("emprestado"),
  observacoes:      text(),
  almoxarifeId:     integer("almoxarife_id"),
  almoxarifeNome:   varchar("almoxarife_nome", { length: 255 }),
  createdAt:        timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  // === Rastreio de equipamento (Rev. 2256) ===
  fotoDevolucaoUrl:     text("foto_devolucao_url"),
  equipamentoProprioId: integer("equipamento_proprio_id"),
  equipamentoLocadoId:  integer("equipamento_locado_id"),
  // Rev. 4011 — Assinatura digital (dataURL PNG) opcional no ato da devolução da ferramenta.
  assinaturaDevolucaoUrl: text("assinatura_devolucao_url"),
});

// Saídas de Insumos/Consumíveis para Funcionários
export const almoxarifadoTransferencias = pgTable("almoxarifado_transferencias", {
  id:               serial().primaryKey(),
  companyId:        integer("company_id").notNull(),
  itemIdOrigem:     integer("item_id_origem").notNull(),
  itemIdDestino:    integer("item_id_destino"),
  itemNome:         varchar("item_nome", { length: 255 }).notNull(),
  unidade:          varchar({ length: 30 }),
  quantidade:       numeric({ precision: 14, scale: 3 }).notNull().default("1"),
  origemTipo:       varchar("origem_tipo", { length: 20 }).notNull().default("central"),
  origemObraId:     integer("origem_obra_id"),
  origemObraNome:   varchar("origem_obra_nome", { length: 255 }),
  destinoTipo:      varchar("destino_tipo", { length: 20 }).notNull().default("central"),
  destinoObraId:    integer("destino_obra_id"),
  destinoObraNome:  varchar("destino_obra_nome", { length: 255 }),
  motivo:           text(),
  almoxarifeId:     integer("almoxarife_id"),
  almoxarifeNome:   varchar("almoxarife_nome", { length: 255 }),
  createdAt:        timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
});

export const almoxarifadoSaidasInsumo = pgTable("almoxarifado_saidas_insumo", {
  id:                serial().primaryKey(),
  companyId:         integer("company_id").notNull(),
  itemId:            integer("item_id").notNull(),
  itemNome:          varchar("item_nome", { length: 255 }).notNull(),
  unidade:           varchar({ length: 30 }),
  quantidade:        numeric({ precision: 10, scale: 3 }).notNull().default("1"),
  funcionarioId:     integer("funcionario_id"),
  funcionarioNome:   varchar("funcionario_nome", { length: 255 }).notNull(),
  funcionarioCodigo: varchar("funcionario_codigo", { length: 20 }),
  obraId:            integer("obra_id"),
  obraNome:          varchar("obra_nome", { length: 255 }),
  motivo:            text(),
  observacoes:       text(),
  almoxarifeId:      integer("almoxarife_id"),
  almoxarifeNome:    varchar("almoxarife_nome", { length: 255 }),
  createdAt:         timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
});

export const warehouseInventorySessions = pgTable("warehouse_inventory_sessions", {
  id:               serial().primaryKey(),
  companyId:        integer("company_id").notNull(),
  obraId:           integer("obra_id"),
  semanaRef:        varchar("semana_ref", { length: 10 }).notNull(),
  status:           varchar({ length: 20 }).notNull().default("pendente"),
  totalItens:       integer("total_itens").notNull().default(0),
  itensConferidos:  integer("itens_conferidos").notNull().default(0),
  itensDivergentes: integer("itens_divergentes").notNull().default(0),
  almoxarifeId:     integer("almoxarife_id"),
  almoxarifeNome:   varchar("almoxarife_nome", { length: 255 }),
  iniciadoEm:       timestamp("iniciado_em", { mode: "string" }),
  concluidoEm:      timestamp("concluido_em", { mode: "string" }),
  createdAt:        timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
});

export const warehouseInventorySessionItems = pgTable("warehouse_inventory_session_items", {
  id:               serial().primaryKey(),
  sessionId:        integer("session_id").notNull(),
  itemId:           integer("item_id").notNull(),
  itemNome:         varchar("item_nome", { length: 255 }),
  quantidadeSistema:numeric("quantidade_sistema", { precision: 14, scale: 3 }).notNull(),
  quantidadeFisica: numeric("quantidade_fisica", { precision: 14, scale: 3 }),
  diferenca:        numeric({ precision: 14, scale: 3 }),
  status:           varchar({ length: 20 }).notNull().default("pendente"),
  observacoes:      text(),
  conferidoEm:      timestamp("conferido_em", { mode: "string" }),
});

// ============================================================
// MÓDULO ALMOXARIFADO — RECEBIMENTO INTELIGENTE (Rev. 814)
// Recebimento via foto NF (IA), via OC, cruzamento NF×OC,
// cadastro automático de itens, controle de divergências.
// ============================================================

export const almoxarifadoRecebimentos = pgTable("almoxarifado_recebimentos", {
  id:               serial().primaryKey(),
  companyId:        integer("company_id").notNull(),
  obraId:           integer("obra_id"),
  obraNome:         varchar("obra_nome", { length: 255 }),
  ordemCompraId:    integer("ordem_compra_id"),
  numeroOc:         varchar("numero_oc", { length: 20 }),
  numeroNf:         varchar("numero_nf", { length: 50 }),
  fornecedorNome:   varchar("fornecedor_nome", { length: 255 }),
  fornecedorCnpj:   varchar("fornecedor_cnpj", { length: 20 }),
  fotoNfUrl:        text("foto_nf_url"),
  fotoMaterialUrl:  text("foto_material_url"),
  metodoEntrada:    varchar("metodo_entrada", { length: 20 }).notNull().default("manual"),
  status:           varchar({ length: 30 }).notNull().default("pendente"),
  totalItensNf:     integer("total_itens_nf").default(0),
  totalItensRecebidos: integer("total_itens_recebidos").default(0),
  temDivergencia:   boolean("tem_divergencia").default(false),
  observacoes:      text(),
  usuarioId:        integer("usuario_id"),
  usuarioNome:      varchar("usuario_nome", { length: 255 }),
  criadoEm:         timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
});

export const almoxarifadoRecebimentoItens = pgTable("almoxarifado_recebimento_itens", {
  id:               serial().primaryKey(),
  recebimentoId:    integer("recebimento_id").notNull(),
  itemId:           integer("item_id"),
  itemNome:         varchar("item_nome", { length: 255 }).notNull(),
  unidade:          varchar({ length: 30 }),
  categoria:        varchar({ length: 100 }),
  quantidadeNf:     numeric("quantidade_nf", { precision: 14, scale: 3 }).notNull().default("0"),
  quantidadeRecebida: numeric("quantidade_recebida", { precision: 14, scale: 3 }).default("0"),
  valorUnitario:    numeric("valor_unitario", { precision: 14, scale: 4 }),
  ocItemId:         integer("oc_item_id"),
  quantidadeOc:     numeric("quantidade_oc", { precision: 14, scale: 3 }),
  statusItem:       varchar("status_item", { length: 20 }).notNull().default("pendente"),
  itemNovo:         boolean("item_novo").default(false),
  motivoDivergencia: text("motivo_divergencia"),
  fotoAvariaUrl:    text("foto_avaria_url"),
  criadoEm:         timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
});

export const almoxarifadoNotificacoes = pgTable("almoxarifado_notificacoes", {
  id:               serial().primaryKey(),
  companyId:        integer("company_id").notNull(),
  recebimentoId:    integer("recebimento_id"),
  tipo:             varchar({ length: 30 }).notNull(),
  destinoModulo:    varchar("destino_modulo", { length: 30 }).notNull(),
  titulo:           varchar({ length: 255 }).notNull(),
  mensagem:         text(),
  lida:             boolean().default(false),
  criadoEm:         timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
});

// ============================================================
// MÓDULO FINANCEIRO COMPLETO — FC Engenharia (Rev. 341)
// ============================================================

// 1. Plano de Contas
export const financialAccounts = pgTable("financial_accounts", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  codigo: varchar({ length: 20 }).notNull(),
  nome: varchar({ length: 255 }).notNull(),
  tipo: text().notNull(),
  natureza: text().notNull(),
  nivel: integer().default(1).notNull(),
  contaPaiId: integer("conta_pai_id"),
  classificacaoDRE: varchar("classificacao_dre", { length: 50 }),
  // Rev. 4109 — código do plano de contas do contador (para exportações contábeis).
  codigoContabilidade: varchar("codigo_contabilidade", { length: 50 }),
  // Rev. 2082 — link categoria → centro de custo (FK opcional p/ financial_cost_centers.id).
  centroCustoId: integer("centro_custo_id"),
  ativo: smallint().default(1).notNull(),
  ordem: integer().default(0),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_fa_company").on(t.companyId)]);

// 2. Lançamentos (coração do sistema)
export const financialEntries = pgTable("financial_entries", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  obraId: integer("obra_id"),
  obraNome: varchar("obra_nome", { length: 255 }),
  contaId: integer("conta_id"),
  contaNome: varchar("conta_nome", { length: 255 }),
  // Rev. 3135 — Centro de custo CADASTRADO (financial_cost_centers) classificado
  // no lançamento (override do derivado da categoria). Análise de Custos.
  centroCustoId: integer("centro_custo_id"),
  centroCustoNome: varchar("centro_custo_nome", { length: 255 }),
  tipo: text().notNull(),
  natureza: text().notNull(),
  valorPrevisto: numeric("valor_previsto", { precision: 15, scale: 2 }).notNull(),
  valorRealizado: numeric("valor_realizado", { precision: 15, scale: 2 }),
  juros: numeric("juros", { precision: 15, scale: 2 }),
  descontos: numeric("descontos", { precision: 15, scale: 2 }),
  outros: numeric("outros", { precision: 15, scale: 2 }),
  dataCompetencia: date("data_competencia", { mode: "string" }).notNull(),
  dataVencimento: date("data_vencimento", { mode: "string" }),
  dataPagamento: date("data_pagamento", { mode: "string" }),
  status: text().default("previsto").notNull(),
  contaBancariaId: integer("conta_bancaria_id"),
  origemModulo: varchar("origem_modulo", { length: 50 }),
  origemId: integer("origem_id"),
  origemDescricao: text("origem_descricao"),
  parcelaNumero: integer("parcela_numero"),
  parcelaTotal: integer("parcela_total"),
  parcelaGrupoId: varchar("parcela_grupo_id", { length: 36 }),
  transferenciaGrupoId: varchar("transferencia_grupo_id", { length: 36 }),
  formaPagamento: text("forma_pagamento"),
  // Rev. 3211 — Gancho "forma de pagamento = Cartão de Crédito": qual cartão
  // (financial_cartoes.id), nº de parcelas e onde foi comprado (estabelecimento).
  // Permite, no futuro, casar a compra do ERP com o item da fatura. Aditivas/nullable.
  cartaoId: integer("cartao_id"),
  cartaoParcelas: integer("cartao_parcelas"),
  cartaoEstabelecimento: varchar("cartao_estabelecimento", { length: 255 }),
  comprovanteUrl: text("comprovante_url"),
  // Rev. 3193 — Dados EXTRAÍDOS do comprovante (PIX/boleto) por IA de visão (Gemini),
  // usados como FONTE DE IDENTIFICAÇÃO p/ desempatar o match extrato×ERP na Conciliação.
  // Aditivos/nullable; self-heal cria via ADD COLUMN IF NOT EXISTS.
  comprovanteBeneficiario: text("comprovante_beneficiario"),
  comprovanteDocumento: varchar("comprovante_documento", { length: 20 }),
  comprovanteTxid: varchar("comprovante_txid", { length: 140 }),
  comprovanteValor: numeric("comprovante_valor", { precision: 15, scale: 2 }),
  comprovanteData: date("comprovante_data", { mode: "string" }),
  comprovanteExtraidoEm: timestamp("comprovante_extraido_em", { mode: "string" }),
  codigoBarras: varchar("codigo_barras", { length: 100 }),
  chequeNumero: varchar("cheque_numero", { length: 20 }),
  chequeBanco: varchar("cheque_banco", { length: 100 }),
  chequeAgencia: varchar("cheque_agencia", { length: 20 }),
  chequeConta: varchar("cheque_conta", { length: 30 }),
  chequeTitular: varchar("cheque_titular", { length: 255 }),
  chequeDataEmissao: date("cheque_data_emissao", { mode: "string" }),
  chequeDataBomPara: date("cheque_data_bom_para", { mode: "string" }),
  chequeStatus: text("cheque_status"),
  chequeUrl: text("cheque_url"),
  chequeTipo: text("cheque_tipo"),
  conciliado: smallint().default(0),
  dataConciliacao: date("data_conciliacao", { mode: "string" }),
  extratoBancoDescricao: text("extrato_banco_descricao"),
  descricao: text(),
  observacoes: text(),
  motivoCancelamento: text("motivo_cancelamento"),
  criadoPorId: integer("criado_por_id"),
  criadoPorNome: varchar("criado_por_nome", { length: 255 }),
  aprovadoPorId: integer("aprovado_por_id"),
  aprovadoPorNome: varchar("aprovado_por_nome", { length: 255 }),
  vehicleId: integer("vehicle_id"),
  fornecedorNome: varchar("fornecedor_nome", { length: 255 }),
  // Rev. 3002 — Contas a Receber "de verdade": cliente do título (manual ou herdado da obra/medição).
  clienteId: integer("cliente_id"),
  clienteNome: varchar("cliente_nome", { length: 255 }),
  anexoUrl: text("anexo_url"),
  anexoNome: varchar("anexo_nome", { length: 255 }),
  editadoPorId: integer("editado_por_id"),
  editadoPorNome: varchar("editado_por_nome", { length: 255 }),
  editadoEm: timestamp("editado_em", { mode: "string" }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("idx_fe_company").on(t.companyId),
  index("idx_fe_obra").on(t.obraId),
  index("idx_fe_competencia").on(t.dataCompetencia),
  index("idx_fe_vencimento").on(t.dataVencimento),
  index("idx_fe_status").on(t.status),
]);

// 2a-bis. Baixas (pagamentos/recebimentos) PARCIAIS de um lançamento (financial_entries).
// Rev. 3743 — um título 1→N baixas (datas/contas/formas diferentes). O `valor_realizado`
// do entry é o ROLLUP (SUM das baixas ativas); o status do entry é derivado: parcial
// (a_pagar / recebido_parcial) enquanto soma < previsto, quitado (pago / recebido) quando
// soma ≥ previsto OU quitação manual. Estorno é SOFT (estornada_em), preserva histórico.
// Aditiva/self-heal (CREATE TABLE IF NOT EXISTS) — ZERO ALTER/DROP/DELETE.
export const financialEntryBaixas = pgTable("financial_entry_baixas", {
  id: serial().notNull(),
  entryId: integer("entry_id").notNull(),
  companyId: integer("company_id").notNull(),
  tipo: text(), // 'despesa' | 'receita' (espelha o entry; facilita relatórios)
  valor: numeric("valor", { precision: 15, scale: 2 }).notNull(),
  data: date("data", { mode: "string" }).notNull(),
  contaBancariaId: integer("conta_bancaria_id"),
  formaPagamento: text("forma_pagamento"),
  juros: numeric("juros", { precision: 15, scale: 2 }),
  descontos: numeric("descontos", { precision: 15, scale: 2 }),
  outros: numeric("outros", { precision: 15, scale: 2 }),
  comprovanteUrl: text("comprovante_url"),
  chequeTipo: text("cheque_tipo"),
  chequeNumero: varchar("cheque_numero", { length: 20 }),
  chequeBanco: varchar("cheque_banco", { length: 100 }),
  chequeAgencia: varchar("cheque_agencia", { length: 20 }),
  chequeConta: varchar("cheque_conta", { length: 30 }),
  chequeTitular: varchar("cheque_titular", { length: 255 }),
  chequeDataEmissao: date("cheque_data_emissao", { mode: "string" }),
  chequeDataBomPara: date("cheque_data_bom_para", { mode: "string" }),
  observacoes: text("observacoes"),
  quitouTotal: smallint("quitou_total").default(0), // baixa que FECHOU o título (auto ou manual)
  estornadaEm: timestamp("estornada_em", { mode: "string" }),
  estornadaPorId: integer("estornada_por_id"),
  estornadaPorNome: varchar("estornada_por_nome", { length: 255 }),
  estornoMotivo: text("estorno_motivo"),
  criadoPorId: integer("criado_por_id"),
  criadoPorNome: varchar("criado_por_nome", { length: 255 }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("idx_feb_entry").on(t.entryId),
  index("idx_feb_company").on(t.companyId),
]);

// 2b. Controle de Cheques (Opção A) — camada de CONTROLE/identificação importada
// da planilha "CONTROLE DE CHEQUES" (abas mensais). NÃO é lançamento financeiro;
// serve para a Conciliação Bancária identificar as linhas anônimas
// "COMPENSACAO CHEQUE NNN" do extrato da Caixa (nº + valor → fornecedor).
// Aditiva/self-heal (CREATE TABLE IF NOT EXISTS) — ZERO ALTER/DROP/DELETE.
export const financialCheques = pgTable("financial_cheques", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  contaBancariaId: integer("conta_bancaria_id"),
  contaCorrenteRaw: varchar("conta_corrente_raw", { length: 60 }),
  bancoCodigo: varchar("banco_codigo", { length: 20 }),
  bancoNome: varchar("banco_nome", { length: 120 }),
  agencia: varchar("agencia", { length: 20 }),
  numeroCheque: varchar("numero_cheque", { length: 30 }),
  fornecedorNome: varchar("fornecedor_nome", { length: 255 }),
  fornecedorId: integer("fornecedor_id"),
  obraId: integer("obra_id"),
  obraNome: varchar("obra_nome", { length: 255 }),
  parcela: varchar("parcela", { length: 20 }),
  nf: varchar("nf", { length: 60 }),
  valor: numeric("valor", { precision: 15, scale: 2 }),
  dataVencimento: date("data_vencimento", { mode: "string" }),
  dataCompensacao: date("data_compensacao", { mode: "string" }),
  status: text("status").default("pendente").notNull(),
  observacao: text("observacao"),
  mesRef: integer("mes_ref"),
  anoRef: integer("ano_ref"),
  origemArquivo: varchar("origem_arquivo", { length: 255 }),
  loteId: varchar("lote_id", { length: 40 }),
  lancamentoId: integer("lancamento_id"),
  conciliado: smallint().default(0),
  dataConciliacao: date("data_conciliacao", { mode: "string" }),
  // Rev. 4068 — persistência do motivo de devolução + conta bancária TENTADA na
  // compensação, detectados na Conciliação Bancária (antes eram só computados on-the-fly).
  motivoDevolucaoCodigo: integer("motivo_devolucao_codigo"),
  motivoDevolucaoTexto: text("motivo_devolucao_texto"),
  contaBancariaTentativaId: integer("conta_bancaria_tentativa_id"),
  contaBancariaTentativaNome: varchar("conta_bancaria_tentativa_nome", { length: 255 }),
  devolvidoEm: timestamp("devolvido_em", { mode: "string" }),
  excluidoEm: timestamp("excluido_em", { mode: "string" }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("idx_chq_company").on(t.companyId),
  index("idx_chq_numero").on(t.numeroCheque),
  index("idx_chq_status").on(t.status),
]);

// Rev. 3747 — VÍNCULO de cheque devolvido a pagamento(s) substituto(s) (PIX/TED).
// Ancorado na LINHA DE DÉBITO do cheque no extrato (`debito_line_id` = bank_statement_lines.id),
// id estável que funciona ATÉ em cheque SEM número. Suporta 1→N vínculos (baixa parcial do
// cheque: ex. cheque 3.000 = pix 2.000 + pix 1.000), cada vínculo separado, estorno por vínculo.
// REGRA DE OURO: NÃO cria/altera linha no extrato — só aponta uma linha que JÁ existe (qualquer
// conta da empresa) e marca o cheque. Cobertura = SUM(valor WHERE estornado_em IS NULL); quando
// cobre o valor do cheque, o par compensação+devolução é auto-desconsiderado do % da conciliação.
// `tipo='ajuste'` (pix_line_id NULL) = "Quitar saldo" manual p/ sobra/arredondamento/divergência.
export const bankChequeVinculos = pgTable("bank_cheque_vinculos", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  debitoLineId: integer("debito_line_id").notNull(),
  creditoLineId: integer("credito_line_id"),
  chequeNumero: varchar("cheque_numero", { length: 30 }),
  tipo: text("tipo").default("pix").notNull(), // pix | ajuste
  // Rev. 4081 — só preenchido quando tipo='ajuste': dinheiro | deposito | cheque_proprio | outro.
  // Distingue um pagamento REAL sem linha de extrato (ex.: parte em dinheiro) de um mero
  // arredondamento, dando rastreabilidade de COMO aquela parcela foi paga.
  formaPagamento: text("forma_pagamento"),
  pixLineId: integer("pix_line_id"),
  pixContaBancariaId: integer("pix_conta_bancaria_id"),
  valor: numeric("valor", { precision: 15, scale: 2 }).notNull(),
  data: date("data", { mode: "string" }),
  descricao: text("descricao"),
  estornadoEm: timestamp("estornado_em", { mode: "string" }),
  estornadoPorId: integer("estornado_por_id"),
  estornadoPorNome: varchar("estornado_por_nome", { length: 255 }),
  criadoPorId: integer("criado_por_id"),
  criadoPorNome: varchar("criado_por_nome", { length: 255 }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("idx_bcv_company").on(t.companyId),
  index("idx_bcv_debito").on(t.debitoLineId),
  index("idx_bcv_pix").on(t.pixLineId),
]);

// ─── Controle de Cartão de Crédito (cadastro + faturas + itens) ───────────────
// Mesma filosofia do Controle de Cheques: CADASTRO/CONTROLE, NÃO vira lançamento.
// Faturas (PDF) lidas por IA; cada COMPRA recebe obra + centro de custo + categoria.
export const financialCartoes = pgTable("financial_cartoes", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  banco: varchar("banco", { length: 120 }),
  bandeira: varchar("bandeira", { length: 60 }),
  final4: varchar("final4", { length: 8 }),
  titular: varchar("titular", { length: 255 }),
  tipoPessoa: varchar("tipo_pessoa", { length: 4 }).default("PJ"),
  // Rev. 4019 — escopo do cartão: 'fc' (uso corporativo, entra na sugestão
  // automática de melhor cartão em Cotação/OC) | 'local' (obra/pessoal/terceiro,
  // NUNCA sugerido automaticamente, só cadastro/controle).
  escopo: varchar("escopo", { length: 10 }).default("fc"),
  status: varchar("status", { length: 20 }).default("ativo"),
  diaFechamento: integer("dia_fechamento"),
  diaVencimento: integer("dia_vencimento"),
  limite: numeric("limite", { precision: 15, scale: 2 }),
  ativo: smallint().default(1).notNull(),
  observacao: text("observacao"),
  excluidoEm: timestamp("excluido_em", { mode: "string" }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("idx_cartao_company").on(t.companyId),
]);

export const financialCartaoFaturas = pgTable("financial_cartao_faturas", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  cartaoId: integer("cartao_id"),
  vencimento: date("vencimento", { mode: "string" }),
  fechamento: date("fechamento", { mode: "string" }),
  total: numeric("total", { precision: 15, scale: 2 }),
  totalCompras: numeric("total_compras", { precision: 15, scale: 2 }),
  faturaAnterior: numeric("fatura_anterior", { precision: 15, scale: 2 }),
  pagamentos: numeric("pagamentos", { precision: 15, scale: 2 }),
  mesRef: integer("mes_ref"),
  anoRef: integer("ano_ref"),
  origemArquivo: varchar("origem_arquivo", { length: 255 }),
  loteId: varchar("lote_id", { length: 40 }),
  conciliado: smallint().default(0),
  dataConciliacao: date("data_conciliacao", { mode: "string" }),
  observacao: text("observacao"),
  excluidoEm: timestamp("excluido_em", { mode: "string" }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("idx_cartao_fat_company").on(t.companyId),
  index("idx_cartao_fat_cartao").on(t.cartaoId),
]);

export const financialCartaoItens = pgTable("financial_cartao_itens", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  faturaId: integer("fatura_id").notNull(),
  cartaoId: integer("cartao_id"),
  data: date("data", { mode: "string" }),
  descricao: varchar("descricao", { length: 300 }),
  cidade: varchar("cidade", { length: 120 }),
  valor: numeric("valor", { precision: 15, scale: 2 }),
  moeda: varchar("moeda", { length: 10 }).default("BRL"),
  cotacao: numeric("cotacao", { precision: 15, scale: 6 }),
  valorOrigem: numeric("valor_origem", { precision: 15, scale: 2 }),
  parcelaAtual: integer("parcela_atual"),
  parcelaTotal: integer("parcela_total"),
  tipo: text("tipo").default("compra").notNull(),
  obraId: integer("obra_id"),
  obraNome: varchar("obra_nome", { length: 255 }),
  centroCustoId: integer("centro_custo_id"),
  centroCustoNome: varchar("centro_custo_nome", { length: 255 }),
  categoriaId: integer("categoria_id"),
  categoriaNome: varchar("categoria_nome", { length: 255 }),
  categoriaSugerida: varchar("categoria_sugerida", { length: 255 }),
  statusClassificacao: text("status_classificacao").default("sugerido").notNull(),
  // Rev. 4019 — vínculo com a Cotação/OC de Compras que gerou a compra no
  // cartão (quando encontrado automaticamente por valor+data+cartão), pra
  // acelerar a conciliação: item já chega classificado (obra) e rastreável.
  compraOcId: integer("compra_oc_id"),
  compraOcNumero: varchar("compra_oc_numero", { length: 20 }),
  excluidoEm: timestamp("excluido_em", { mode: "string" }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("idx_cartao_item_company").on(t.companyId),
  index("idx_cartao_item_fatura").on(t.faturaId),
]);

// 3. Receitas de obras (medições → faturamento)
export const financialRevenue = pgTable("financial_revenue", {
  id: serial().notNull(),
  companyId: integer().notNull(),
  obraId: integer("obra_id").notNull(),
  obraNome: varchar("obra_nome", { length: 255 }),
  clienteNome: varchar("cliente_nome", { length: 255 }),
  clienteCnpj: varchar("cliente_cnpj", { length: 20 }),
  valorContrato: numeric("valor_contrato", { precision: 15, scale: 2 }),
  valorAditivos: numeric("valor_aditivos", { precision: 15, scale: 2 }).default("0"),
  valorContratoTotal: numeric("valor_contrato_total", { precision: 15, scale: 2 }),
  medicaoId: integer("medicao_id"),
  medicaoNumero: integer("medicao_numero"),
  percentualMedicao: numeric("percentual_medicao", { precision: 5, scale: 2 }),
  valorMedicao: numeric("valor_medicao", { precision: 15, scale: 2 }),
  nfNumero: varchar("nf_numero", { length: 50 }),
  nfUrl: text("nf_url"),
  nfEmitidaEm: date("nf_emitida_em", { mode: "string" }),
  dataVencimento: date("data_vencimento", { mode: "string" }),
  dataRecebimento: date("data_recebimento", { mode: "string" }),
  valorRecebido: numeric("valor_recebido", { precision: 15, scale: 2 }),
  juros: numeric("juros", { precision: 15, scale: 2 }),
  descontos: numeric("descontos", { precision: 15, scale: 2 }),
  outros: numeric("outros", { precision: 15, scale: 2 }),
  status: text().default("a_faturar"), // a_faturar | faturado | a_receber | recebido_parcial | recebido_total | cancelado
  formaPagamento: varchar("forma_pagamento", { length: 50 }),
  comprovanteUrl: text("comprovante_url"),
  retencaoISS: numeric("retencao_iss", { precision: 10, scale: 2 }).default("0"),
  retencaoINSS: numeric("retencao_inss", { precision: 10, scale: 2 }).default("0"),
  retencaoIR: numeric("retencao_ir", { precision: 10, scale: 2 }).default("0"),
  retencaoTotal: numeric("retencao_total", { precision: 10, scale: 2 }).default("0"),
  valorLiquidoReceber: numeric("valor_liquido_receber", { precision: 15, scale: 2 }),
  contaBancariaId: integer("conta_bancaria_id"),
  observacoes: text(),
  createdAt: timestamp({ mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp({ mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("idx_fr_company").on(t.companyId),
  index("idx_fr_obra").on(t.obraId),
  index("idx_fr_status").on(t.status),
]);

// 4. Configuração tributária
export const financialTaxConfig = pgTable("financial_tax_config", {
  id: serial().notNull(),
  companyId: integer().notNull(),
  regimeTributario: text().notNull(), // simples_nacional | lucro_presumido | lucro_real | mei
  anexoSimples: text("anexo_simples"), // I | II | III | IV | V
  aliquotaSimples: numeric("aliquota_simples", { precision: 5, scale: 2 }),
  aliquotaISS: numeric("aliquota_iss", { precision: 5, scale: 2 }).default("3.00"),
  aliquotaPIS: numeric("aliquota_pis", { precision: 5, scale: 2 }).default("0.65"),
  aliquotaCOFINS: numeric("aliquota_cofins", { precision: 5, scale: 2 }).default("3.00"),
  aliquotaIRPJ: numeric("aliquota_irpj", { precision: 5, scale: 2 }).default("15.00"),
  aliquotaCSLL: numeric("aliquota_csll", { precision: 5, scale: 2 }).default("9.00"),
  aliquotaINSSEmpresa: numeric("aliquota_inss_empresa", { precision: 5, scale: 2 }).default("20.00"),
  aliquotaFGTS: numeric("aliquota_fgts", { precision: 5, scale: 2 }).default("8.00"),
  aliquotaRAT: numeric("aliquota_rat", { precision: 5, scale: 2 }).default("3.00"),
  aliquotaSistema: numeric("aliquota_sistema", { precision: 5, scale: 2 }).default("5.80"),
  diaPagamentoISS: integer("dia_pagamento_iss").default(10),
  diaPagamentoPIS: integer("dia_pagamento_pis").default(25),
  diaPagamentoCOFINS: integer("dia_pagamento_cofins").default(25),
  diaPagamentoDARF: integer("dia_pagamento_darf").default(20),
  diaPagamentoGPS: integer("dia_pagamento_gps").default(20),
  diaPagamentoFGTS: integer("dia_pagamento_fgts").default(7),
  ativo: smallint().default(1).notNull(),
  // Rev. 3183 — Toggle por empresa: importação automática de dados financeiros (default OFF).
  autoImportEnabled: smallint("auto_import_enabled").default(0).notNull(),
  updatedAt: timestamp({ mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_ftc_company").on(t.companyId)]);

// 5. Obrigações fiscais (guias)
export const financialTaxObligations = pgTable("financial_tax_obligations", {
  id: serial().notNull(),
  companyId: integer().notNull(),
  tipo: text().notNull(), // das_simples | darf_irpj | darf_csll | darf_pis | darf_cofins | gps_inss | guia_fgts | iss | icms
  mesCompetencia: varchar("mes_competencia", { length: 7 }).notNull(),
  baseCalculo: numeric("base_calculo", { precision: 15, scale: 2 }),
  aliquota: numeric({ precision: 5, scale: 2 }),
  valorPrincipal: numeric("valor_principal", { precision: 15, scale: 2 }).notNull(),
  valorMulta: numeric("valor_multa", { precision: 10, scale: 2 }).default("0"),
  valorJuros: numeric("valor_juros", { precision: 10, scale: 2 }).default("0"),
  valorTotal: numeric("valor_total", { precision: 15, scale: 2 }).notNull(),
  dataVencimento: date("data_vencimento", { mode: "string" }).notNull(),
  dataPagamento: date("data_pagamento", { mode: "string" }),
  codigoReceita: varchar("codigo_receita", { length: 20 }),
  codigoBarras: varchar("codigo_barras", { length: 100 }),
  guiaUrl: text("guia_url"),
  status: text().default("a_pagar"), // a_pagar | pago | atrasado | cancelado
  geradaAutomaticamente: smallint("gerada_automaticamente").default(1),
  entryId: integer("entry_id"),
  createdAt: timestamp({ mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("idx_fto_company").on(t.companyId),
  index("idx_fto_competencia").on(t.mesCompetencia),
  index("idx_fto_vencimento").on(t.dataVencimento),
]);

// 6. Centros de custo
export const financialCostCenters = pgTable("financial_cost_centers", {
  id: serial().notNull(),
  companyId: integer().notNull(),
  codigo: varchar({ length: 20 }).notNull(),
  nome: varchar({ length: 255 }).notNull(),
  tipo: text().notNull(), // obra | administrativo | comercial | financeiro
  obraId: integer("obra_id"),
  responsavelId: integer("responsavel_id"),
  responsavelNome: varchar("responsavel_nome", { length: 255 }),
  orcamentoMensal: numeric("orcamento_mensal", { precision: 15, scale: 2 }),
  ativo: smallint().default(1).notNull(),
  createdAt: timestamp({ mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_fcc_company").on(t.companyId)]);

// Rev. 3351 — Base configurável de CNPJs/CPFs que representam MOVIMENTAÇÃO INTERNA
// (transferência entre contas do próprio grupo FC, capitalização entre empresas-irmãs,
// PIX/TED intra-grupo). A Conciliação consulta esta base e NÃO conta esses lançamentos
// como caixa real (externo) — aplicado SIMETRICAMENTE em entrada E saída p/ corrigir a
// assimetria da heurística por regex (que pegava o crédito mas não a perna do débito).
// `cnpj` guarda só DÍGITOS (sem máscara); o match é "dígitos da descrição CONTÊM os dígitos
// cadastrados" (registrar a raiz de 8 dígitos pega todas as filiais).
export const financialInternalCnpjs = pgTable("financial_internal_cnpjs", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  cnpj: varchar({ length: 20 }).notNull(),
  nome: varchar({ length: 255 }),
  observacao: text(),
  ativo: smallint().default(1).notNull(),
  criadoPor: varchar("criado_por", { length: 255 }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_fic_company").on(t.companyId)]);

// Rev. 3351 — EXCEÇÃO por lançamento: o usuário pode dizer que um lançamento específico,
// embora bata na base interna, é na verdade um CRÉDITO EFETIVO (ex.: empréstimo da empresa X
// p/ a Y, capitalização) — ou o contrário (forçar interno). `natureza`: 'efetivo' tira do
// interno (volta p/ caixa real) · 'interno' força interno · 'auto' = sem exceção (volta à
// regra automática). `line_id` = bank_statement_lines.id.
export const financialInternalOverrides = pgTable("financial_internal_overrides", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  lineId: integer("line_id").notNull(),
  natureza: varchar({ length: 20 }).notNull(),
  motivo: text(),
  criadoPor: varchar("criado_por", { length: 255 }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("idx_fio_company").on(t.companyId),
  uniqueIndex("uq_fio_company_line").on(t.companyId, t.lineId),
]);

// 7. Extrato bancário (conciliação)
export const bankStatementLines = pgTable("bank_statement_lines", {
  id: serial().notNull(),
  companyId: integer().notNull(),
  contaBancariaId: integer("conta_bancaria_id").notNull(),
  data: date({ mode: "string" }).notNull(),
  descricao: text().notNull(),
  valor: numeric({ precision: 15, scale: 2 }).notNull(),
  tipo: text().notNull(), // credito | debito
  saldoApos: numeric("saldo_apos", { precision: 15, scale: 2 }),
  conciliado: smallint().default(0),
  entryId: integer("entry_id"),
  importadoEm: timestamp({ mode: "string" }).defaultNow().notNull(),
  // Rev. 3179 — soft-delete: "Limpar extrato" marca a linha como excluída (NULL=ativa).
  // Honra a regra JAMAIS DELETE: removemos via UPDATE e filtramos em todas as leituras.
  excluidoEm: timestamp("excluido_em", { mode: "string" }),
  // Rev. 3742 — DESCONSIDERAR da conciliação (≠ excluir). A linha CONTINUA visível no
  // extrato/painel (NÃO apaga a informação), mas sai do CÁLCULO do % de conciliação.
  // Uso típico: cheque devolvido cujo pagamento real (PIX/TED) foi conciliado em OUTRA
  // conta — o par compensação+devolução não tem como casar aqui e travava o % < 100%.
  // NULL = conta normalmente no %; preenchido = ignorado no %.
  desconsideradoEm: timestamp("desconsiderado_em", { mode: "string" }),
  desconsideradoPorId: integer("desconsiderado_por_id"),
  desconsideradoPorNome: varchar("desconsiderado_por_nome", { length: 255 }),
  // Rev. 3940 — IGNORAR SUGESTÃO de conciliação automática. Persiste a decisão do
  // usuário de não parear esta linha de extrato com nenhum lançamento sugerido.
  // Diferente de desconsiderado_em (que retira do % de conciliação): esta coluna
  // apenas exclui a linha do ENGINE de sugestões; ela continua visível no painel
  // em "No extrato, sem lançamento" e entra normalmente no cálculo do %.
  // NULL = elegível para sugestão; preenchido = excluída do engine de sugestões.
  sugestaoIgnoradaEm: timestamp("sugestao_ignorada_em", { mode: "string" }),
}, (t) => [
  index("idx_bsl_company").on(t.companyId),
  index("idx_bsl_conta").on(t.contaBancariaId),
  index("idx_bsl_data").on(t.data),
]);

// 7b. Rev. 3216 — Demonstrativos consolidados de pagamento (1 PDF com TODOS os PIX +
// 1 PDF com TODOS os boletos pagos do mês), por conta+ano+mês. INFORMAÇÃO DE APOIO à
// conciliação: o extrato só mostra "PIX valor X" sem beneficiário; o usuário consulta
// esses demonstrativos pra identificar quem recebeu. NÃO é comprovante por lançamento.
export const financialConciliacaoDemonstrativos = pgTable("financial_conciliacao_demonstrativos", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  contaBancariaId: integer("conta_bancaria_id").notNull(),
  ano: integer().notNull(),
  mes: integer().notNull(),
  pixUrl: text("pix_url"),
  pixNome: text("pix_nome"),
  boletoUrl: text("boleto_url"),
  boletoNome: text("boleto_nome"),
  criadoEm: timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em", { mode: "string" }),
}, (t) => [
  uniqueIndex("uq_fcd_chave").on(t.companyId, t.contaBancariaId, t.ano, t.mes),
]);

// Rev. 3266 — VEREDICTO do usuário sobre a identificação por IA dos demonstrativos
// (texto roxo da Conciliação). 1 veredicto por LINHA do extrato (confirmado/errado).
// NÃO concilia/baixa nada — só registra a conferência da leitura.
export const financialConciliacaoDemoConfirmacoes = pgTable("financial_conciliacao_demo_confirmacoes", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  contaBancariaId: integer("conta_bancaria_id").notNull(),
  extratoLinhaId: integer("extrato_linha_id").notNull(),
  demonstrativoId: integer("demonstrativo_id"),
  tipo: varchar({ length: 12 }),
  veredicto: varchar({ length: 12 }).notNull(), // confirmado | errado | pendente
  beneficiario: text(),
  documento: text(),
  txid: text(),
  valor: numeric({ precision: 15, scale: 2 }),
  dataPagamento: date("data_pagamento", { mode: "string" }),
  usuarioId: integer("usuario_id"),
  usuarioNome: varchar("usuario_nome", { length: 255 }),
  criadoEm: timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em", { mode: "string" }),
}, (t) => [
  uniqueIndex("uq_fcdc_linha").on(t.companyId, t.contaBancariaId, t.extratoLinhaId),
]);

// 8. Saldo bancário diário
export const bankDailyBalance = pgTable("bank_daily_balance", {
  id: serial().notNull(),
  companyId: integer().notNull(),
  contaBancariaId: integer("conta_bancaria_id").notNull(),
  data: date({ mode: "string" }).notNull(),
  saldo: numeric({ precision: 15, scale: 2 }).notNull(),
  fonte: text().default("manual"), // manual | ofx | api_banco
  createdAt: timestamp({ mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_bdb_company_data").on(t.companyId, t.data)]);

// 9. Medições de obra
export const obraMedicoes = pgTable("obra_medicoes", {
  id: serial().notNull(),
  companyId: integer().notNull(),
  obraId: integer("obra_id").notNull(),
  numero: integer().notNull(),
  dataReferencia: date("data_referencia", { mode: "string" }).notNull(),
  percentualAcumulado: numeric("percentual_acumulado", { precision: 5, scale: 2 }),
  percentualPeriodo: numeric("percentual_periodo", { precision: 5, scale: 2 }),
  valorContrato: numeric("valor_contrato", { precision: 15, scale: 2 }),
  valorMedicao: numeric("valor_medicao", { precision: 15, scale: 2 }),
  valorAcumulado: numeric("valor_acumulado", { precision: 15, scale: 2 }),
  status: text().default("rascunho"), // rascunho | submetida | aprovada | faturada
  aprovadoPorId: integer("aprovado_por_id"),
  aprovadoEm: timestamp({ mode: "string" }),
  revenueId: integer("revenue_id"),
  observacoes: text(),
  itens: text(),
  createdAt: timestamp({ mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp({ mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("idx_om_company").on(t.companyId),
  index("idx_om_obra").on(t.obraId),
]);

// 10. Previsão de caixa
export const cashFlowForecast = pgTable("cash_flow_forecast", {
  id: serial().notNull(),
  companyId: integer().notNull(),
  data: date({ mode: "string" }).notNull(),
  tipo: text().notNull(), // entrada_prevista | saida_prevista | entrada_realizada | saida_realizada
  categoria: varchar({ length: 100 }),
  descricao: text(),
  valor: numeric({ precision: 15, scale: 2 }).notNull(),
  origemTipo: varchar("origem_tipo", { length: 50 }),
  origemId: integer("origem_id"),
  obraId: integer("obra_id"),
  saldoAcumulado: numeric("saldo_acumulado", { precision: 15, scale: 2 }),
  geradoEm: timestamp({ mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_cff_company_data").on(t.companyId, t.data)]);

// 11. DRE cache
export const dreCache = pgTable("dre_cache", {
  id: serial().notNull(),
  companyId: integer().notNull(),
  obraId: integer("obra_id"),
  periodo: varchar({ length: 7 }).notNull(),
  tipoPeriodo: text().notNull(), // mensal | trimestral | anual
  dados: text().notNull(),
  calculadoEm: timestamp({ mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_dc_company_periodo").on(t.companyId, t.periodo)]);

// 12. Aprovações financeiras (anti-fraude)
export const financialApprovals = pgTable("financial_approvals", {
  id: serial().notNull(),
  companyId: integer().notNull(),
  entryId: integer("entry_id").notNull(),
  valor: numeric({ precision: 15, scale: 2 }).notNull(),
  status: text().default("pendente"), // pendente | aprovado | recusado
  aprovadorId: integer("aprovador_id"),
  aprovadorNome: varchar("aprovador_nome", { length: 255 }),
  motivoRecusa: text("motivo_recusa"),
  createdAt: timestamp({ mode: "string" }).defaultNow().notNull(),
  resolvidoEm: timestamp({ mode: "string" }),
}, (t) => [index("idx_fap_company").on(t.companyId)]);

// 13. Saldo de abertura dos bancos
export const financialOpeningBalances = pgTable("financial_opening_balances", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  contaBancariaId: integer("conta_bancaria_id"),
  contaNome: varchar("conta_nome", { length: 255 }),
  dataAbertura: date("data_abertura", { mode: "string" }).notNull(),
  valor: numeric({ precision: 15, scale: 2 }).notNull(),
  confirmedByUserId: integer("confirmed_by_user_id"),
  confirmedByName: varchar("confirmed_by_name", { length: 255 }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_fob_company").on(t.companyId)]);

// 14. Sócios e pró-labore
export const companyPartners = pgTable("company_partners", {
  id: serial().notNull(),
  companyId: integer().notNull(),
  employeeId: integer("employee_id"),
  nome: varchar({ length: 255 }).notNull(),
  cpf: varchar({ length: 14 }),
  cargo: varchar({ length: 100 }),
  percentualSociedade: numeric("percentual_sociedade", { precision: 5, scale: 2 }),
  valorProLabore: numeric("valor_pro_labore", { precision: 10, scale: 2 }),
  diaVencimento: integer("dia_vencimento").default(5),
  contaBancariaDestinoId: integer("conta_bancaria_destino_id"),
  pixChave: varchar("pix_chave", { length: 255 }),
  ativo: smallint().default(1).notNull(),
  createdAt: timestamp({ mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp({ mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_cp_company").on(t.companyId)]);

// 15. Régua de cobrança
export const collectionRules = pgTable("collection_rules", {
  id: serial().notNull(),
  companyId: integer().notNull(),
  nome: varchar({ length: 255 }),
  diasAtraso1: integer("dias_atraso_1").default(3),
  mensagem1: text("mensagem_1"),
  diasAtraso2: integer("dias_atraso_2").default(10),
  mensagem2: text("mensagem_2"),
  diasAtraso3: integer("dias_atraso_3").default(30),
  mensagem3: text("mensagem_3"),
  diasAtraso4: integer("dias_atraso_4").default(60),
  mensagem4: text("mensagem_4"),
  enviarEmail: smallint("enviar_email").default(1),
  ativo: smallint().default(1).notNull(),
  createdAt: timestamp({ mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_cr_company").on(t.companyId)]);

// 16. Log de cobranças
export const collectionLog = pgTable("collection_log", {
  id: serial().notNull(),
  companyId: integer().notNull(),
  revenueId: integer("revenue_id"),
  obraId: integer("obra_id"),
  clienteNome: varchar("cliente_nome", { length: 255 }),
  valorDevido: numeric("valor_devido", { precision: 15, scale: 2 }),
  diasAtraso: integer("dias_atraso"),
  etapa: integer(),
  mensagemEnviada: text("mensagem_enviada"),
  canaisEnviados: varchar("canais_enviados", { length: 100 }),
  enviadoEm: timestamp({ mode: "string" }).defaultNow().notNull(),
  status: text().default("enviado"), // enviado | erro | ignorado
}, (t) => [index("idx_cl_company").on(t.companyId)]);

// 17. Budget anual
export const financialBudget = pgTable("financial_budget", {
  id: serial().notNull(),
  companyId: integer().notNull(),
  ano: integer().notNull(),
  mes: integer().notNull(),
  contaId: integer("conta_id"),
  obraId: integer("obra_id"),
  valorOrcado: numeric("valor_orcado", { precision: 15, scale: 2 }).notNull(),
  observacoes: text(),
  criadoPorId: integer("criado_por_id"),
  createdAt: timestamp({ mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp({ mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_fb_company_ano").on(t.companyId, t.ano)]);

// 18. Alertas de revisão financeira
export const financialRevisionAlerts = pgTable("financial_revision_alerts", {
  id: serial().primaryKey(),
  companyId: integer("company_id").notNull(),
  entryId: integer("entry_id"),
  revenueId: integer("revenue_id"),
  tipo: text().notNull(), // vencimento_proximo | vencimento_atrasado | divergencia_valor | aprovacao_pendente | limite_alcada
  nivel: text().notNull().default("info"), // info | warning | critical
  titulo: varchar({ length: 255 }).notNull(),
  descricao: text(),
  valorReferencia: numeric("valor_referencia", { precision: 15, scale: 2 }),
  dataReferencia: date("data_referencia", { mode: "string" }),
  responsavelId: integer("responsavel_id"),
  responsavelNome: varchar("responsavel_nome", { length: 255 }),
  lido: smallint().default(0),
  lidoEm: timestamp("lido_em", { mode: "string" }),
  resolvido: smallint().default(0),
  resolvidoEm: timestamp("resolvido_em", { mode: "string" }),
  resolvidoPorId: integer("resolvido_por_id"),
  resolvidoPorNome: varchar("resolvido_por_nome", { length: 255 }),
  origemModulo: varchar("origem_modulo", { length: 50 }),
  origemId: integer("origem_id"),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("idx_fra_company").on(t.companyId),
  index("idx_fra_tipo").on(t.tipo),
  index("idx_fra_nivel").on(t.nivel),
  index("idx_fra_resolvido").on(t.resolvido),
]);

// 19. Aprovações de pagamento (alçada — COSO Framework)
export const financialPaymentApprovals = pgTable("financial_payment_approvals", {
  id: serial().primaryKey(),
  companyId: integer("company_id").notNull(),
  entryId: integer("entry_id").notNull(),
  valor: numeric({ precision: 15, scale: 2 }).notNull(),
  nivel: text().notNull(), // coordenador | gerente | diretoria
  status: text().default("pendente").notNull(), // pendente | aprovado | recusado
  solicitanteId: integer("solicitante_id"),
  solicitanteNome: varchar("solicitante_nome", { length: 255 }),
  aprovadorId: integer("aprovador_id"),
  aprovadorNome: varchar("aprovador_nome", { length: 255 }),
  motivoRecusa: text("motivo_recusa"),
  observacoes: text(),
  expiradoEm: timestamp("expirado_em", { mode: "string" }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  resolvidoEm: timestamp("resolvido_em", { mode: "string" }),
}, (t) => [
  index("idx_fpa_company").on(t.companyId),
  index("idx_fpa_status").on(t.status),
]);

// 20. Conciliação bancária detalhada
export const financialReconciliationLog = pgTable("financial_reconciliation_log", {
  id: serial().primaryKey(),
  companyId: integer("company_id").notNull(),
  contaBancariaId: integer("conta_bancaria_id").notNull(),
  periodoInicio: date("periodo_inicio", { mode: "string" }).notNull(),
  periodoFim: date("periodo_fim", { mode: "string" }).notNull(),
  saldoExtrato: numeric("saldo_extrato", { precision: 15, scale: 2 }),
  saldoSistema: numeric("saldo_sistema", { precision: 15, scale: 2 }),
  diferenca: numeric({ precision: 15, scale: 2 }),
  totalItens: integer("total_itens").default(0),
  itensConciliados: integer("itens_conciliados").default(0),
  status: text().default("aberto"), // aberto | conciliado | pendente_revisao
  realizadoPorId: integer("realizado_por_id"),
  realizadoPorNome: varchar("realizado_por_nome", { length: 255 }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  fechadoEm: timestamp("fechado_em", { mode: "string" }),
}, (t) => [index("idx_frl_company").on(t.companyId)]);

// 21. KPIs financeiros cache (Fase 5)
export const financialKpiCache = pgTable("financial_kpi_cache", {
  id: serial().primaryKey(),
  companyId: integer("company_id").notNull(),
  obraId: integer("obra_id"),
  periodo: varchar({ length: 7 }).notNull(),
  tipoPeriodo: text("tipo_periodo").default("mensal").notNull(),
  kpiJson: text("kpi_json").notNull(),
  calculadoEm: timestamp("calculado_em", { mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("idx_fkc_company_periodo").on(t.companyId, t.periodo),
]);

// 22. Log de importação financeira automática
export const financialImportLog = pgTable("financial_import_log", {
  id: serial().primaryKey(),
  companyId: integer("company_id").notNull(),
  origemModulo: varchar("origem_modulo", { length: 50 }).notNull(),
  mesReferencia: varchar("mes_referencia", { length: 7 }),
  totalImportados: integer("total_importados").default(0),
  totalErros: integer("total_erros").default(0),
  detalhes: text(),
  executadoEm: timestamp("executado_em", { mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_fil_company").on(t.companyId)]);

// ============================================================
// MÓDULO DE COMPRAS — TABELAS COMPLETAS
// ============================================================

export const purchaseCatalogItems = pgTable("purchase_catalog_items", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  nome: varchar({ length: 255 }).notNull(),
  nomeAbreviado: varchar("nome_abreviado", { length: 100 }),
  codigo: varchar({ length: 50 }),
  unidade: varchar({ length: 20 }).notNull().default("un"),
  categoria: varchar({ length: 100 }),
  ncm: varchar({ length: 10 }),
  fotoUrl: text("foto_url"),
  codigoSinapi: varchar("codigo_sinapi", { length: 20 }),
  contaFinanceiraId: integer("conta_financeira_id"),
  contaFinanceiraNome: varchar("conta_financeira_nome", { length: 255 }),
  naturezaFinanceira: text("natureza_financeira").default("variavel"),
  ativo: smallint().default(1).notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_pci_company").on(t.companyId)]);

export const supplierPriceHistory = pgTable("supplier_price_history", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  catalogItemId: integer("catalog_item_id").notNull(),
  supplierId: integer("supplier_id").notNull(),
  supplierNome: varchar("supplier_nome", { length: 255 }),
  valorUnitario: numeric("valor_unitario", { precision: 10, scale: 2 }).notNull(),
  valorFrete: numeric("valor_frete", { precision: 10, scale: 2 }).default("0"),
  valorTotalUnitario: numeric("valor_total_unitario", { precision: 10, scale: 2 }),
  unidade: varchar({ length: 20 }),
  dataReferencia: date("data_referencia", { mode: "string" }).notNull(),
  cotacaoId: integer("cotacao_id"),
  ordemCompraId: integer("ordem_compra_id"),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("idx_sph_item").on(t.catalogItemId),
  index("idx_sph_supplier").on(t.supplierId),
]);

export const supplierEvaluations = pgTable("supplier_evaluations", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  supplierId: integer("supplier_id").notNull(),
  ordemCompraId: integer("ordem_compra_id"),
  notaPrazo: integer("nota_prazo"),
  notaQualidade: integer("nota_qualidade"),
  notaAtendimento: integer("nota_atendimento"),
  mediaGeral: numeric("media_geral", { precision: 3, scale: 2 }),
  observacoes: text(),
  avaliadorId: integer("avaliador_id"),
  avaliadorNome: varchar("avaliador_nome", { length: 255 }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_se_supplier").on(t.supplierId)]);

export const supplierContracts = pgTable("supplier_contracts", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  supplierId: integer("supplier_id").notNull(),
  supplierNome: varchar("supplier_nome", { length: 255 }),
  catalogItemId: integer("catalog_item_id"),
  itemNome: varchar("item_nome", { length: 255 }),
  valorUnitario: numeric("valor_unitario", { precision: 10, scale: 2 }).notNull(),
  unidade: varchar({ length: 20 }),
  dataInicio: date("data_inicio", { mode: "string" }).notNull(),
  dataFim: date("data_fim", { mode: "string" }).notNull(),
  observacoes: text(),
  status: text().default("ativo").notNull(),
  alertaEnviado: smallint("alerta_enviado").default(0),
  tipo: text().default("material"),
  escopo: text(),
  obraId: integer("obra_id"),
  obraNome: varchar("obra_nome", { length: 255 }),
  valorTotal: numeric("valor_total", { precision: 15, scale: 2 }),
  condicaoPagamento: varchar("condicao_pagamento", { length: 255 }),
  contratoConfirmado: smallint("contrato_confirmado").default(0),
  confirmadoEm: timestamp("confirmado_em", { mode: "string" }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_sc_company").on(t.companyId)]);

export const purchaseApprovalRules = pgTable("purchase_approval_rules", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  nome: varchar({ length: 255 }).notNull(),
  obraId: integer("obra_id"),
  nivel1AprovadorTipo: text("nivel1_aprovador_tipo"),
  nivel1AprovadorId: integer("nivel1_aprovador_id"),
  nivel1Cargo: varchar("nivel1_cargo", { length: 100 }),
  nivel1PrazoHoras: integer("nivel1_prazo_horas").default(24),
  nivel2Ativo: smallint("nivel2_ativo").default(1),
  nivel2AprovadorTipo: text("nivel2_aprovador_tipo"),
  nivel2AprovadorId: integer("nivel2_aprovador_id"),
  nivel2PrazoHoras: integer("nivel2_prazo_horas").default(8),
  limiteCompraDireta: numeric("limite_compra_direta", { precision: 10, scale: 2 }).default("500"),
  limiteCaixaMinimoOC: numeric("limite_caixa_minimo_oc", { precision: 15, scale: 2 }),
  slaEmergencialHoras: integer("sla_emergencial_horas").default(4),
  ativo: smallint().default(1).notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_par_company").on(t.companyId)]);

export const purchaseSpendingLimits = pgTable("purchase_spending_limits", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  nome: varchar({ length: 255 }),
  obraId: integer("obra_id"),
  catalogCategoria: varchar("catalog_categoria", { length: 100 }),
  periodoTipo: text("periodo_tipo").default("mensal"),
  valorLimite: numeric("valor_limite", { precision: 15, scale: 2 }).notNull(),
  acaoAoAtingir: text("acao_ao_atingir").default("alertar"),
  alertaPercentual: integer("alerta_percentual").default(80),
  ativo: smallint().default(1).notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_psl_company").on(t.companyId)]);

export const ocNumberConfig = pgTable("oc_number_config", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  prefixo: varchar({ length: 20 }).default("OC"),
  separador: varchar({ length: 5 }).default("-"),
  formatoAno: text("formato_ano").default("4dig"),
  digitosSequencial: integer("digitos_sequencial").default(3),
  reiniciarAnualmente: smallint("reiniciar_anualmente").default(1),
  proximoNumero: integer("proximo_numero").default(1),
  comissaoPercentual: numeric("comissao_percentual", { precision: 5, scale: 2 }).default("10"),
  retencaoTecnicaPerc: numeric("retencao_tecnica_perc", { precision: 5, scale: 2 }).default("5"),
  diaCorte: integer("dia_corte").default(25),
  prazoAprovacaoDias: integer("prazo_aprovacao_dias").default(5),
  diaPagamento: integer("dia_pagamento").default(10),
  prefixoOs: varchar("prefixo_os", { length: 20 }).default("OS"),
  proximoNumeroOs: integer("proximo_numero_os").default(1),
  alertaReservasAtivo: smallint("alerta_reservas_ativo").default(1),
  // Rev. 2633 — Fonte global do "% Previsto" do Planejamento: "motor" (curva
  // calculada pelo Caminho B na baseline) ou "manual" (curva alimentada por
  // upload semanal de XML, lendo PercentComplete). Interruptor nos Critérios.
  previstoFonte: varchar("previsto_fonte", { length: 10 }).default("motor"),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_onc_company").on(t.companyId)]);

export const purchaseRequests = pgTable("purchase_requests", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  obraId: integer("obra_id").notNull(),
  obraNome: varchar("obra_nome", { length: 255 }),
  eapItemId: integer("eap_item_id"),
  eapItemNome: varchar("eap_item_nome", { length: 255 }),
  solicitanteId: integer("solicitante_id").notNull(),
  solicitanteNome: varchar("solicitante_nome", { length: 255 }),
  tipo: text().default("compra").notNull(),
  status: text().default("rascunho").notNull(),
  emergencial: smallint().default(0).notNull(),
  justificativaEmergencial: text("justificativa_emergencial"),
  prazoNecessidade: date("prazo_necessidade", { mode: "string" }),
  justificativaRecusa: text("justificativa_recusa"),
  aprovadorId: integer("aprovador_id"),
  aprovadorNome: varchar("aprovador_nome", { length: 255 }),
  aprovadoEm: timestamp("aprovado_em", { mode: "string" }),
  valorEstimadoTotal: numeric("valor_estimado_total", { precision: 15, scale: 2 }),
  valorMetaTotal: numeric("valor_meta_total", { precision: 15, scale: 2 }),
  estouroMeta: smallint("estourou_meta").default(0),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("idx_pr_company").on(t.companyId),
  index("idx_pr_obra").on(t.obraId),
  index("idx_pr_status").on(t.status),
  index("idx_pr_emergencial").on(t.emergencial),
]);

export const purchaseRequestItems = pgTable("purchase_request_items", {
  id: serial().notNull(),
  solicitacaoId: integer("solicitacao_id").notNull(),
  catalogItemId: integer("catalog_item_id"),
  insumoNome: varchar("insumo_nome", { length: 255 }).notNull(),
  unidade: varchar({ length: 20 }).notNull(),
  quantidade: numeric({ precision: 10, scale: 3 }).notNull(),
  quantidadeEstoqueDisponivel: numeric("quantidade_estoque_disponivel", { precision: 10, scale: 3 }).default("0"),
  quantidadeRetiradaEstoque: numeric("quantidade_retirada_estoque", { precision: 10, scale: 3 }).default("0"),
  quantidadeAComprar: numeric("quantidade_a_comprar", { precision: 10, scale: 3 }),
  valorMetaUnitario: numeric("valor_meta_unitario", { precision: 10, scale: 2 }),
  valorUltimaCompra: numeric("valor_ultima_compra", { precision: 10, scale: 2 }),
  observacoes: text(),
}, (t) => [index("idx_pri_sc").on(t.solicitacaoId)]);

export const purchaseQuotations = pgTable("purchase_quotations", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  solicitacaoId: integer("solicitacao_id").notNull(),
  status: text().default("aberta").notNull(),
  minimoFornecedores: integer("minimo_fornecedores").default(3),
  fornecedorVencedorId: integer("fornecedor_vencedor_id"),
  justificativaVencedor: text("justificativa_vencedor"),
  compradorId: integer("comprador_id"),
  compradorNome: varchar("comprador_nome", { length: 255 }),
  validadeDias: integer("validade_dias").default(5),
  validadeAte: date("validade_ate", { mode: "string" }),
  emailEnviado: smallint("email_enviado").default(0),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_pq_company").on(t.companyId)]);

export const purchaseQuotationSuppliers = pgTable("purchase_quotation_suppliers", {
  id: serial().notNull(),
  cotacaoId: integer("cotacao_id").notNull(),
  supplierId: integer("supplier_id").notNull(),
  supplierNome: varchar("supplier_nome", { length: 255 }),
  status: text().default("aguardando").notNull(),
  valorUnitario: numeric("valor_unitario", { precision: 10, scale: 2 }),
  valorFrete: numeric("valor_frete", { precision: 10, scale: 2 }).default("0"),
  freteTipo: text("frete_tipo").default("cif"),
  valorTotalComFrete: numeric("valor_total_com_frete", { precision: 10, scale: 2 }),
  transportadora: varchar("transportadora", { length: 255 }),
  prazoEntregaDias: integer("prazo_entrega_dias"),
  condicaoPagamento: varchar("condicao_pagamento", { length: 255 }),
  tipoPagamento: varchar("tipo_pagamento", { length: 50 }),
  numeroParcelas: integer("numero_parcelas"),
  validadeDias: integer("validade_dias").default(5),
  observacoes: text(),
  respondidoEm: timestamp("respondido_em", { mode: "string" }),
  scoreTotal: numeric("score_total", { precision: 5, scale: 2 }),
}, (t) => [index("idx_pqs_cotacao").on(t.cotacaoId)]);

export const purchaseQuotationTokens = pgTable("purchase_quotation_tokens", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  cotacaoId: integer("cotacao_id").notNull(),
  quotationSupplierId: integer("quotation_supplier_id").notNull(),
  supplierId: integer("supplier_id"),
  supplierNome: varchar("supplier_nome", { length: 255 }),
  supplierEmail: varchar("supplier_email", { length: 255 }),
  token: varchar({ length: 64 }).notNull(),
  expiresAt: timestamp("expires_at", { mode: "string" }),
  accessedAt: timestamp("accessed_at", { mode: "string" }),
  respondedAt: timestamp("responded_at", { mode: "string" }),
  status: text().default("enviado"),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_pqt_token").on(t.token)]);

export const purchaseNegotiations = pgTable("purchase_negotiations", {
  id: serial().notNull(),
  cotacaoId: integer("cotacao_id").notNull(),
  quotationSupplierId: integer("quotation_supplier_id"),
  rodada: integer().default(1),
  tipo: text(),
  valorUnitarioProposto: numeric("valor_unitario_proposto", { precision: 10, scale: 2 }),
  mensagem: text(),
  autor: varchar({ length: 100 }),
  autorNome: varchar("autor_nome", { length: 255 }),
  criadoEm: timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_pn_cotacao").on(t.cotacaoId)]);

export const purchaseOrders = pgTable("purchase_orders", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  numero: varchar({ length: 20 }),
  solicitacaoId: integer("solicitacao_id"),
  cotacaoId: integer("cotacao_id"),
  supplierId: integer("supplier_id").notNull(),
  supplierNome: varchar("supplier_nome", { length: 255 }),
  obraId: integer("obra_id"),
  obraNome: varchar("obra_nome", { length: 255 }),
  compradorId: integer("comprador_id"),
  compradorNome: varchar("comprador_nome", { length: 255 }),
  tipo: text().default("compra").notNull(),
  status: text().default("emitida").notNull(),
  valorItens: numeric("valor_itens", { precision: 15, scale: 2 }),
  valorFrete: numeric("valor_frete", { precision: 15, scale: 2 }).default("0"),
  freteTipo: text("frete_tipo").default("cif"),
  transportadora: varchar("transportadora", { length: 255 }),
  codigoRastreamento: varchar("codigo_rastreamento", { length: 100 }),
  valorTotal: numeric("valor_total", { precision: 15, scale: 2 }),
  formaPagamento: varchar("forma_pagamento", { length: 255 }),
  tipoPagamento: varchar("tipo_pagamento", { length: 50 }),
  numeroParcelas: integer("numero_parcelas").default(1),
  prazoEntrega: date("prazo_entrega", { mode: "string" }),
  cnpjComprador: varchar("cnpj_comprador", { length: 20 }),
  inscricaoEstadual: varchar("inscricao_estadual", { length: 30 }),
  enderecoEntrega: text("endereco_entrega"),
  cidadeEntrega: varchar("cidade_entrega", { length: 100 }),
  estadoEntrega: varchar("estado_entrega", { length: 2 }),
  cepEntrega: varchar("cep_entrega", { length: 10 }),
  locacaoDataInicio: date("locacao_data_inicio", { mode: "string" }),
  locacaoDataFim: date("locacao_data_fim", { mode: "string" }),
  locacaoValorDiario: numeric("locacao_valor_diario", { precision: 10, scale: 2 }),
  financialEntryId: integer("financial_entry_id"),
  accountsPayableId: integer("accounts_payable_id"),
  retencaoINSS: numeric("retencao_inss", { precision: 10, scale: 2 }).default("0"),
  retencaoIR: numeric("retencao_ir", { precision: 10, scale: 2 }).default("0"),
  retencaoISS: numeric("retencao_iss", { precision: 10, scale: 2 }).default("0"),
  observacoes: text(),
  pdfUrl: text("pdf_url"),
  portalToken: varchar("portal_token", { length: 64 }),
  emitidaEm: timestamp("emitida_em", { mode: "string" }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("idx_po_company").on(t.companyId),
  index("idx_po_obra").on(t.obraId),
  index("idx_po_status").on(t.status),
  index("idx_po_portal_token").on(t.portalToken),
]);

export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: serial().notNull(),
  ordemId: integer("ordem_id").notNull(),
  catalogItemId: integer("catalog_item_id"),
  insumoNome: varchar("insumo_nome", { length: 255 }).notNull(),
  unidade: varchar({ length: 20 }).notNull(),
  quantidadePedida: numeric("quantidade_pedida", { precision: 10, scale: 3 }).notNull(),
  quantidadeRecebida: numeric("quantidade_recebida", { precision: 10, scale: 3 }).default("0"),
  valorUnitario: numeric("valor_unitario", { precision: 10, scale: 2 }).notNull(),
  valorTotal: numeric("valor_total", { precision: 10, scale: 2 }).notNull(),
  valorMetaUnitario: numeric("valor_meta_unitario", { precision: 10, scale: 2 }),
  contaFinanceiraId: integer("conta_financeira_id"),
}, (t) => [index("idx_poi_ordem").on(t.ordemId)]);

export const purchaseReceipts = pgTable("purchase_receipts", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  ordemId: integer("ordem_id").notNull(),
  obraId: integer("obra_id"),
  recebedorId: integer("recebedor_id"),
  recebedorNome: varchar("recebedor_nome", { length: 255 }),
  status: text().notNull(),
  notaFiscalNumero: varchar("nota_fiscal_numero", { length: 100 }),
  notaFiscalUrl: text("nota_fiscal_url"),
  fotoMaterialUrl: text("foto_material_url"),
  observacoes: text(),
  financialEntryLiberadoId: integer("financial_entry_liberado_id"),
  valorLiberado: numeric("valor_liberado", { precision: 15, scale: 2 }),
  recebidoEm: timestamp("recebido_em", { mode: "string" }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_prec_ordem").on(t.ordemId)]);

export const purchaseReceiptItems = pgTable("purchase_receipt_items", {
  id: serial().notNull(),
  recebimentoId: integer("recebimento_id").notNull(),
  ordemItemId: integer("ordem_item_id").notNull(),
  insumoNome: varchar("insumo_nome", { length: 255 }),
  unidade: varchar({ length: 20 }),
  quantidadePedida: numeric("quantidade_pedida", { precision: 10, scale: 3 }),
  quantidadeRecebida: numeric("quantidade_recebida", { precision: 10, scale: 3 }).notNull(),
  quantidadePendente: numeric("quantidade_pendente", { precision: 10, scale: 3 }),
}, (t) => [index("idx_preci_receb").on(t.recebimentoId)]);

export const purchaseReturns = pgTable("purchase_returns", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  ordemId: integer("ordem_id").notNull(),
  motivo: text().notNull(),
  itens: text(),
  status: text().default("solicitada"),
  valorEstornado: numeric("valor_estornado", { precision: 15, scale: 2 }),
  financialEntryEstornoId: integer("financial_entry_estorno_id"),
  solicitanteId: integer("solicitante_id"),
  solicitanteNome: varchar("solicitante_nome", { length: 255 }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_pret_ordem").on(t.ordemId)]);

export const purchaseAccountsPayable = pgTable("purchase_accounts_payable", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  ordemId: integer("ordem_id"),
  supplierId: integer("supplier_id"),
  supplierNome: varchar("supplier_nome", { length: 255 }),
  obraId: integer("obra_id"),
  descricao: text(),
  valorTotal: numeric("valor_total", { precision: 15, scale: 2 }).notNull(),
  valorPago: numeric("valor_pago", { precision: 15, scale: 2 }).default("0"),
  status: text().default("bloqueado").notNull(),
  formaPagamento: varchar("forma_pagamento", { length: 50 }),
  dataVencimento: date("data_vencimento", { mode: "string" }),
  dataPagamento: date("data_pagamento", { mode: "string" }),
  supplierBanco: varchar("supplier_banco", { length: 100 }),
  supplierAgencia: varchar("supplier_agencia", { length: 20 }),
  supplierConta: varchar("supplier_conta", { length: 30 }),
  supplierPix: varchar("supplier_pix", { length: 255 }),
  supplierCnpj: varchar("supplier_cnpj", { length: 20 }),
  comprovanteUrl: text("comprovante_url"),
  financialEntryId: integer("financial_entry_id"),
  parcelaNumero: integer("parcela_numero").default(1),
  parcelaTotal: integer("parcela_total").default(1),
  parcelaGrupoId: varchar("parcela_grupo_id", { length: 36 }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("idx_pap_company").on(t.companyId),
  index("idx_pap_status").on(t.status),
  index("idx_pap_vencimento").on(t.dataVencimento),
]);

export const budgetReallocations = pgTable("budget_reallocations", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  obraId: integer("obra_id").notNull(),
  origemEapItemId: integer("origem_eap_item_id"),
  origemEapItemNome: varchar("origem_eap_item_nome", { length: 255 }),
  destinoEapItemId: integer("destino_eap_item_id"),
  destinoEapItemNome: varchar("destino_eap_item_nome", { length: 255 }),
  valorRealocado: numeric("valor_realocado", { precision: 15, scale: 2 }).notNull(),
  motivo: text().notNull(),
  usuarioId: integer("usuario_id"),
  usuarioNome: varchar("usuario_nome", { length: 255 }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_br_obra").on(t.obraId)]);

export const buyerCommissions = pgTable("buyer_commissions", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  obraId: integer("obra_id").notNull(),
  obraNome: varchar("obra_nome", { length: 255 }),
  compradorId: integer("comprador_id").notNull(),
  compradorNome: varchar("comprador_nome", { length: 255 }),
  valorMetaTotal: numeric("valor_meta_total", { precision: 15, scale: 2 }),
  valorCompradoTotal: numeric("valor_comprado_total", { precision: 15, scale: 2 }),
  economiaTotal: numeric("economia_total", { precision: 15, scale: 2 }),
  percentualParticipacao: numeric("percentual_participacao", { precision: 5, scale: 2 }),
  valorComissao: numeric("valor_comissao", { precision: 15, scale: 2 }),
  status: text().default("em_aberto").notNull(),
  aprovadoPor: varchar("aprovado_por", { length: 255 }),
  aprovadoEm: timestamp("aprovado_em", { mode: "string" }),
  financialEntryId: integer("financial_entry_id"),
  calculadoEm: timestamp("calculado_em", { mode: "string" }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_bc_obra").on(t.obraId)]);

export const emergencyMetrics = pgTable("emergency_metrics", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  engenheiroId: integer("engenheiro_id").notNull(),
  engenheiroNome: varchar("engenheiro_nome", { length: 255 }),
  obraId: integer("obra_id"),
  obraNome: varchar("obra_nome", { length: 255 }),
  mes: integer().notNull(),
  ano: integer().notNull(),
  totalSolicitacoes: integer("total_solicitacoes").default(0),
  totalEmergenciais: integer("total_emergenciais").default(0),
  percentualEmergencial: numeric("percentual_emergencial", { precision: 5, scale: 2 }).default("0"),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_em_eng").on(t.engenheiroId)]);

export const purchaseCancellations = pgTable("purchase_cancellations", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  tipo: text().notNull(),
  referenciaId: integer("referencia_id").notNull(),
  motivo: text().notNull(),
  efeitos: text(),
  canceladoPorId: integer("cancelado_por_id"),
  canceladoPorNome: varchar("cancelado_por_nome", { length: 255 }),
  canceladoEm: timestamp("cancelado_em", { mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_pc_company").on(t.companyId)]);

export const sinapiPriceCache = pgTable("sinapi_price_cache", {
  id: serial().notNull(),
  codigo: varchar({ length: 20 }),
  descricao: varchar({ length: 500 }),
  unidade: varchar({ length: 20 }),
  estado: varchar({ length: 2 }),
  mesReferencia: varchar("mes_referencia", { length: 7 }),
  precoSemDesoneracao: numeric("preco_sem_desoneracao", { precision: 10, scale: 2 }),
  precoComDesoneracao: numeric("preco_com_desoneracao", { precision: 10, scale: 2 }),
  atualizadoEm: timestamp("atualizado_em", { mode: "string" }).defaultNow().notNull(),
}, (t) => [index("idx_sinapi_codigo").on(t.codigo)]);

export const medicaoContratos = pgTable("medicao_contratos", {
  id:                   serial().primaryKey(),
  companyId:            integer("company_id").notNull(),
  projetoId:            integer("projeto_id").notNull(),
  criterio:             varchar({ length: 30 }).notNull().default("avanco_fisico"),
  valorTotalContrato:   numeric("valor_total_contrato", { precision: 15, scale: 2 }).default("0"),
  percentualSinal:      numeric("percentual_sinal", { precision: 5, scale: 2 }).default("0"),
  valorSinalRecebido:   numeric("valor_sinal_recebido", { precision: 15, scale: 2 }).default("0"),
  percentualRetencao:   numeric("percentual_retencao", { precision: 5, scale: 2 }),
  valorMinimoFd:        numeric("valor_minimo_fd", { precision: 15, scale: 2 }),
  status:               varchar({ length: 20 }).notNull().default("ativo"),
  observacoes:          text(),
  criadoEm:             timestamp("criado_em").defaultNow(),
  atualizadoEm:         timestamp("atualizado_em").defaultNow(),
  deletedAt:            timestamp("deleted_at"),
}, (t) => [index("idx_mc_projeto").on(t.projetoId), index("idx_mc_company").on(t.companyId)]);

export const medicaoBoletins = pgTable("medicao_boletins", {
  id:                   serial().primaryKey(),
  companyId:            integer("company_id").notNull(),
  contratoId:           integer("contrato_id").notNull(),
  numero:               integer().notNull(),
  periodoReferencia:    varchar("periodo_referencia", { length: 7 }).notNull(),
  dataInicio:           date("data_inicio", { mode: "string" }),
  dataFim:              date("data_fim", { mode: "string" }),
  status:               varchar({ length: 20 }).notNull().default("rascunho"),
  dataEnvio:            date("data_envio", { mode: "string" }),
  dataAprovacao:        date("data_aprovacao", { mode: "string" }),
  valorBruto:           numeric("valor_bruto", { precision: 15, scale: 2 }).default("0"),
  descontoSinal:        numeric("desconto_sinal", { precision: 15, scale: 2 }).default("0"),
  descontoRetencao:     numeric("desconto_retencao", { precision: 15, scale: 2 }).default("0"),
  glosa:                numeric({ precision: 15, scale: 2 }).default("0"),
  deducaoFd:            numeric("deducao_fd", { precision: 15, scale: 2 }).default("0"),
  valorLiquido:         numeric("valor_liquido", { precision: 15, scale: 2 }).default("0"),
  observacoes:          text(),
  financialEntryId:     integer("financial_entry_id"),
  criadoEm:             timestamp("criado_em").defaultNow(),
  atualizadoEm:         timestamp("atualizado_em").defaultNow(),
}, (t) => [index("idx_mb_contrato").on(t.contratoId), index("idx_mb_company").on(t.companyId)]);

export const medicaoBoletimItens = pgTable("medicao_boletim_itens", {
  id:                           serial().primaryKey(),
  boletimId:                    integer("boletim_id").notNull(),
  atividadeId:                  integer("atividade_id"),
  eapCodigo:                    varchar("eap_codigo", { length: 50 }),
  descricao:                    varchar({ length: 500 }).notNull(),
  valorContratual:              numeric("valor_contratual", { precision: 15, scale: 2 }).default("0"),
  percentualAcumuladoAnterior:  numeric("percentual_acumulado_anterior", { precision: 8, scale: 4 }).default("0"),
  percentualPeriodo:            numeric("percentual_periodo", { precision: 8, scale: 4 }).default("0"),
  percentualAcumuladoAtual:     numeric("percentual_acumulado_atual", { precision: 8, scale: 4 }).default("0"),
  valorPeriodo:                 numeric("valor_periodo", { precision: 15, scale: 2 }).default("0"),
  tipoAvanco:                   varchar("tipo_avanco", { length: 30 }).notNull().default("fisico"),
  isFd:                         boolean("is_fd").default(false),
  criadoEm:                     timestamp("criado_em").defaultNow(),
}, (t) => [index("idx_mbi_boletim").on(t.boletimId)]);

export const medicaoFdRegistros = pgTable("medicao_fd_registros", {
  id:                   serial().primaryKey(),
  companyId:            integer("company_id").notNull(),
  contratoId:           integer("contrato_id").notNull(),
  descricao:            varchar({ length: 500 }).notNull(),
  valor:                numeric({ precision: 15, scale: 2 }).notNull(),
  dataRegistro:         date("data_registro", { mode: "string" }).notNull(),
  status:               varchar({ length: 20 }).notNull().default("pendente"),
  boletimDescontoId:    integer("boletim_desconto_id"),
  compraId:             integer("compra_id"),
  origem:               varchar({ length: 20 }).notNull().default("manual"),
  observacoes:          text(),
  criadoEm:             timestamp("criado_em").defaultNow(),
  atualizadoEm:         timestamp("atualizado_em").defaultNow(),
}, (t) => [index("idx_mfd_contrato").on(t.contratoId), index("idx_mfd_company").on(t.companyId)]);

// Rev. 2893 — MEDIÇÃO COM LEVANTAMENTO EM PDF (levantamento de campo sobre planta).
// Medição numerada por contrato → PDFs (pavimento/setor) → contornos (área/volume/
// perímetro/contagem) com calibração de escala → fotos. Modelo nasce offline-ready
// (uuid client-stable em cada linha) p/ a Task #67 (PWA), sem implementar PWA agora.

export const medicaoCampo = pgTable("medicao_campo", {
  id:               serial().primaryKey(),
  companyId:        integer("company_id").notNull(),
  contratoId:       integer("contrato_id").notNull(),
  uuid:             varchar({ length: 64 }),
  numero:           integer().notNull(),
  titulo:           varchar({ length: 255 }),
  descricao:        text(),
  status:           varchar({ length: 20 }).notNull().default("rascunho"),
  boletimId:        integer("boletim_id"),
  medicaoId:        integer("medicao_id"), // Rev. 3078 — vínculo ao terceiro_medicoes (levantamento da medição de terceiro)
  origem:           varchar({ length: 20 }).default("cliente").notNull(), // Rev. 3078 — cliente | terceiro (IDs de contrato colidem entre tabelas)
  criadoPorId:      integer("criado_por_id"),
  criadoPorNome:    varchar("criado_por_nome", { length: 255 }),
  criadoEm:         timestamp("criado_em").defaultNow(),
  atualizadoEm:     timestamp("atualizado_em").defaultNow(),
  deletedAt:        timestamp("deleted_at"),
}, (t) => [index("idx_mcamp_contrato").on(t.contratoId), index("idx_mcamp_company").on(t.companyId)]);

export const medicaoCampoPdfs = pgTable("medicao_campo_pdfs", {
  id:               serial().primaryKey(),
  companyId:        integer("company_id").notNull(),
  medicaoCampoId:   integer("medicao_campo_id").notNull(),
  uuid:             varchar({ length: 64 }),
  nome:             varchar({ length: 255 }).notNull(),
  tipo:             varchar({ length: 20 }).notNull().default("pavimento"),
  arquivoUrl:       text("arquivo_url").notNull(),
  arquivoKey:       text("arquivo_key"),
  arquivoNome:      varchar("arquivo_nome", { length: 500 }),
  numPaginas:       integer("num_paginas").default(1),
  calibracaoJson:   text("calibracao_json"),
  ordem:            integer().default(0),
  criadoEm:         timestamp("criado_em").defaultNow(),
  atualizadoEm:     timestamp("atualizado_em").defaultNow(),
  deletedAt:        timestamp("deleted_at"),
}, (t) => [index("idx_mcpdf_campo").on(t.medicaoCampoId), index("idx_mcpdf_company").on(t.companyId)]);

export const medicaoCampoContornos = pgTable("medicao_campo_contornos", {
  id:               serial().primaryKey(),
  companyId:        integer("company_id").notNull(),
  medicaoCampoId:   integer("medicao_campo_id").notNull(),
  pdfId:            integer("pdf_id").notNull(),
  uuid:             varchar({ length: 64 }),
  pagina:           integer().default(1),
  numero:           integer(),
  tipo:             varchar({ length: 20 }).notNull(),
  rotulo:           varchar({ length: 255 }),
  cor:              varchar({ length: 20 }),
  geometriaJson:    text("geometria_json").notNull(),
  espessura:        numeric({ precision: 12, scale: 4 }),
  metrosPorUnidade: numeric("metros_por_unidade", { precision: 18, scale: 10 }),
  area:             numeric({ precision: 18, scale: 4 }),
  perimetro:        numeric({ precision: 18, scale: 4 }),
  volume:           numeric({ precision: 18, scale: 4 }),
  contagem:         integer(),
  quantidade:       numeric({ precision: 18, scale: 4 }),
  unidade:          varchar({ length: 10 }),
  orcamentoItemId:  integer("orcamento_item_id"),
  itemEapCodigo:    varchar("item_eap_codigo", { length: 50 }),
  itemDescricao:    varchar("item_descricao", { length: 500 }),
  observacoes:      text(),
  criadoEm:         timestamp("criado_em").defaultNow(),
  atualizadoEm:     timestamp("atualizado_em").defaultNow(),
  deletedAt:        timestamp("deleted_at"),
}, (t) => [
  index("idx_mccont_campo").on(t.medicaoCampoId),
  index("idx_mccont_pdf").on(t.pdfId),
  index("idx_mccont_company").on(t.companyId),
]);

export const medicaoCampoFotos = pgTable("medicao_campo_fotos", {
  id:               serial().primaryKey(),
  companyId:        integer("company_id").notNull(),
  medicaoCampoId:   integer("medicao_campo_id").notNull(),
  pdfId:            integer("pdf_id"),
  contornoId:       integer("contorno_id"),
  uuid:             varchar({ length: 64 }),
  arquivoUrl:       text("arquivo_url").notNull(),
  arquivoKey:       text("arquivo_key"),
  legenda:          varchar({ length: 500 }),
  pagina:           integer(),
  pinX:             numeric("pin_x", { precision: 10, scale: 6 }),
  pinY:             numeric("pin_y", { precision: 10, scale: 6 }),
  criadoEm:         timestamp("criado_em").defaultNow(),
  deletedAt:        timestamp("deleted_at"),
}, (t) => [index("idx_mcfoto_campo").on(t.medicaoCampoId), index("idx_mcfoto_company").on(t.companyId)]);

export const employeeFaceDescriptors = pgTable("employee_face_descriptors", {
  id:             serial("id").primaryKey(),
  companyId:      integer("company_id").notNull(),
  employeeId:     integer("employee_id").notNull().unique(),
  descriptor:     text("descriptor").notNull(),
  fotoCapturadaUrl: text("foto_capturada_url"),
  enrolledAt:     timestamp("enrolled_at").defaultNow().notNull(),
  enrolledBy:     varchar("enrolled_by", { length: 255 }),
  enrolledByUserId: integer("enrolled_by_user_id"),
  updatedAt:      timestamp("updated_at").defaultNow(),
}, (t) => [
  index("idx_efd_company").on(t.companyId),
  index("idx_efd_employee").on(t.employeeId),
]);

export const gdFicheirosObra = pgTable("gd_ficheiros_obra", {
  id:        serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  obraId:    integer("obra_id").notNull(),
  status:    varchar("status", { length: 30 }).default("ativo"),
  criadoPor: integer("criado_por"),
  criadoEm:  timestamp("criado_em").defaultNow(),
}, (t) => [
  index("idx_gd_fich_company").on(t.companyId),
  index("idx_gd_fich_obra").on(t.companyId, t.obraId),
]);

// Rev. 1774 — `tipoAcervo` separa pastas técnicas (projetos) de pastas
// administrativas (contratos, propostas, atas, seguros…). `categoriaChave`
// vincula uma pasta administrativa à entrada do catálogo central
// (gd_categorias_admin_padrao) — NULL para pastas tipo 'projeto' ou
// pastas admin avulsas criadas manualmente. `ordem` controla ordenação
// estável das pastas admin (catálogo numerado).
export const gdDisciplinas = pgTable("gd_disciplinas", {
  id:             serial("id").primaryKey(),
  companyId:      integer("company_id").notNull(),
  ficheiroId:     integer("ficheiro_id"),
  nome:           varchar("nome", { length: 100 }).notNull(),
  sigla:          varchar("sigla", { length: 10 }).notNull(),
  cor:            varchar("cor", { length: 7 }).default("#3b82f6"),
  ativo:          boolean("ativo").default(true),
  tipoAcervo:     varchar("tipo_acervo", { length: 20 }).default("projeto"),
  categoriaChave: varchar("categoria_chave", { length: 50 }),
  ordem:          integer("ordem").default(0),
  criadoEm:       timestamp("criado_em").defaultNow(),
}, (t) => [
  index("idx_gd_disc_company").on(t.companyId),
  index("idx_gd_disc_ficheiro").on(t.ficheiroId),
]);

// Rev. 1774 — Catálogo central de categorias administrativas por empresa.
// Cada obra ao ser aberta recebe um seed dessas categorias como disciplinas
// tipoAcervo='documento'. Editável em Configurações > Gestão de Documentos.
export const gdCategoriasAdminPadrao = pgTable("gd_categorias_admin_padrao", {
  id:        serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  chave:     varchar("chave", { length: 50 }).notNull(),
  nome:      varchar("nome", { length: 150 }).notNull(),
  sigla:     varchar("sigla", { length: 10 }).notNull(),
  cor:       varchar("cor", { length: 7 }).default("#64748B"),
  ordem:     integer("ordem").default(0),
  ativo:     boolean("ativo").default(true),
  criadoEm:  timestamp("criado_em").defaultNow(),
}, (t) => [
  index("idx_gd_cat_adm_company").on(t.companyId),
]);

export const gdPastas = pgTable("gd_pastas", {
  id:           serial("id").primaryKey(),
  companyId:    integer("company_id").notNull(),
  ficheiroId:   integer("ficheiro_id").notNull(),
  disciplinaId: integer("disciplina_id").notNull(),
  nome:         varchar("nome", { length: 50 }).notNull(),
  criadoEm:     timestamp("criado_em").defaultNow(),
}, (t) => [
  index("idx_gd_pasta_company").on(t.companyId),
  index("idx_gd_pasta_disc").on(t.disciplinaId),
]);

export const gdTiposDocumento = pgTable("gd_tipos_documento", {
  id:              serial("id").primaryKey(),
  companyId:       integer("company_id").notNull(),
  nome:            varchar("nome", { length: 150 }).notNull(),
  sigla:           varchar("sigla", { length: 10 }).notNull(),
  requerAprovacao: boolean("requer_aprovacao").default(false),
  ativo:           boolean("ativo").default(true),
  criadoEm:        timestamp("criado_em").defaultNow(),
}, (t) => [index("idx_gd_tipo_company").on(t.companyId)]);

export const gdDocumentos = pgTable("gd_documentos", {
  id:              serial("id").primaryKey(),
  companyId:       integer("company_id").notNull(),
  obraId:          integer("obra_id").notNull(),
  ficheiroId:      integer("ficheiro_id"),
  disciplinaId:    integer("disciplina_id"),
  pastaId:         integer("pasta_id"),
  subpasta:        varchar("subpasta", { length: 50 }),
  tipoDocumentoId: integer("tipo_documento_id"),
  codigo:          varchar("codigo", { length: 100 }).notNull(),
  titulo:          varchar("titulo", { length: 500 }).notNull(),
  descricao:       text("descricao"),
  status:          varchar("status", { length: 30 }).default("em_elaboracao"),
  revisaoAtual:    varchar("revisao_atual", { length: 10 }).default("0"),
  emitente:        varchar("emitente", { length: 255 }),
  responsavelId:   integer("responsavel_id"),
  dataEmissao:     date("data_emissao"),
  dataValidade:    date("data_validade"),
  tags:            text("tags"),
  arquivoUrl:      text("arquivo_url"),
  arquivoNome:     varchar("arquivo_nome", { length: 500 }),
  arquivoTamanho:  integer("arquivo_tamanho"),
  metadata:        json("metadata"),
  deletedAt:       timestamp("deleted_at"),
  criadoPor:       integer("criado_por"),
  criadoEm:        timestamp("criado_em").defaultNow(),
  atualizadoEm:    timestamp("atualizado_em").defaultNow(),
}, (t) => [
  index("idx_gd_doc_company").on(t.companyId),
  index("idx_gd_doc_obra").on(t.obraId),
  index("idx_gd_doc_disciplina").on(t.disciplinaId),
  index("idx_gd_doc_tipo").on(t.tipoDocumentoId),
  index("idx_gd_doc_codigo").on(t.companyId, t.obraId, t.codigo),
]);

export const gdRevisoes = pgTable("gd_revisoes", {
  id:            serial("id").primaryKey(),
  companyId:     integer("company_id").notNull(),
  documentoId:   integer("documento_id").notNull(),
  numero:        varchar("numero", { length: 10 }).notNull(),
  descricao:     text("descricao"),
  status:        varchar("status", { length: 30 }).default("pendente"),
  arquivoUrl:    text("arquivo_url"),
  arquivoNome:   varchar("arquivo_nome", { length: 500 }),
  arquivoTamanho: integer("arquivo_tamanho"),
  arquivoMime:   varchar("arquivo_mime", { length: 100 }),
  motivoRevisao: text("motivo_revisao"),
  aprovadoPor:   integer("aprovado_por"),
  aprovadoEm:    timestamp("aprovado_em"),
  criadoPor:     integer("criado_por"),
  criadoEm:      timestamp("criado_em").defaultNow(),
}, (t) => [
  index("idx_gd_rev_company").on(t.companyId),
  index("idx_gd_rev_doc").on(t.documentoId),
]);

export const gdRevisaoComentarios = pgTable("gd_revisao_comentarios", {
  id:          serial("id").primaryKey(),
  companyId:   integer("company_id").notNull(),
  revisaoId:   integer("revisao_id").notNull(),
  usuarioId:   integer("usuario_id").notNull(),
  comentario:  text("comentario").notNull(),
  tipo:        varchar("tipo", { length: 30 }).default("comentario"),
  posicaoX:    real("posicao_x"),
  posicaoY:    real("posicao_y"),
  pagina:      integer("pagina"),
  resolvido:   boolean("resolvido").default(false),
  criadoEm:    timestamp("criado_em").defaultNow(),
}, (t) => [
  index("idx_gd_com_company").on(t.companyId),
  index("idx_gd_com_revisao").on(t.revisaoId),
]);

export const gdDistribuicao = pgTable("gd_distribuicao", {
  id:           serial("id").primaryKey(),
  companyId:    integer("company_id").notNull(),
  documentoId:  integer("documento_id").notNull(),
  revisaoId:    integer("revisao_id"),
  usuarioId:    integer("usuario_id").notNull(),
  dataEnvio:    timestamp("data_envio").defaultNow(),
  visualizado:  boolean("visualizado").default(false),
  visualizadoEm: timestamp("visualizado_em"),
  confirmado:   boolean("confirmado").default(false),
  confirmadoEm: timestamp("confirmado_em"),
}, (t) => [
  index("idx_gd_dist_company").on(t.companyId),
  index("idx_gd_dist_doc").on(t.documentoId),
  index("idx_gd_dist_usuario").on(t.usuarioId),
]);

export const gdDownloadLog = pgTable("gd_download_log", {
  id:          serial("id").primaryKey(),
  companyId:   integer("company_id").notNull(),
  documentoId: integer("documento_id").notNull(),
  revisaoId:   integer("revisao_id"),
  usuarioId:   integer("usuario_id").notNull(),
  ip:          varchar("ip", { length: 50 }),
  criadoEm:    timestamp("criado_em").defaultNow(),
}, (t) => [
  index("idx_gd_dl_company").on(t.companyId),
  index("idx_gd_dl_doc").on(t.documentoId),
]);

export const gdTiposSubpasta = pgTable("gd_tipos_subpasta", {
  id:        serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  nome:      varchar("nome", { length: 50 }).notNull(),
  padrao:    boolean("padrao").default(false),
  ativo:     boolean("ativo").default(true),
  criadoEm:  timestamp("criado_em").defaultNow(),
}, (t) => [index("idx_gd_tsub_company").on(t.companyId)]);

export const gdArts = pgTable("gd_arts", {
  id:            serial("id").primaryKey(),
  companyId:     integer("company_id").notNull(),
  obraId:        integer("obra_id").notNull(),
  documentoId:   integer("documento_id"),
  tipo:          varchar("tipo", { length: 10 }).notNull(),
  numero:        varchar("numero", { length: 50 }).notNull(),
  profissional:  varchar("profissional", { length: 255 }).notNull(),
  creaOuCau:     varchar("crea_ou_cau", { length: 50 }),
  dataEmissao:   date("data_emissao"),
  dataValidade:  date("data_validade"),
  status:        varchar("status", { length: 30 }).default("vigente"),
  arquivoUrl:    text("arquivo_url"),
  observacoes:   text("observacoes"),
  criadoPor:     integer("criado_por"),
  criadoEm:      timestamp("criado_em").defaultNow(),
  atualizadoEm:  timestamp("atualizado_em").defaultNow(),
}, (t) => [
  index("idx_gd_art_company").on(t.companyId),
  index("idx_gd_art_obra").on(t.obraId),
  index("idx_gd_art_doc").on(t.documentoId),
]);

export const serviceContractTokens = pgTable("service_contract_tokens", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  contractId: integer("contract_id").notNull(),
  supplierId: integer("supplier_id").notNull(),
  supplierNome: varchar("supplier_nome", { length: 255 }),
  supplierEmail: varchar("supplier_email", { length: 255 }),
  token: varchar({ length: 64 }).notNull(),
  expiresAt: timestamp("expires_at", { mode: "string" }),
  accessedAt: timestamp("accessed_at", { mode: "string" }),
  confirmedAt: timestamp("confirmed_at", { mode: "string" }),
  status: text().default("enviado"),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("idx_sct_token").on(t.token),
  index("idx_sct_contract").on(t.contractId),
]);

export const serviceContractMeasurements = pgTable("service_contract_measurements", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  contractId: integer("contract_id").notNull(),
  supplierId: integer("supplier_id").notNull(),
  mesReferencia: varchar("mes_referencia", { length: 7 }).notNull(),
  percentualConcluido: numeric("percentual_concluido", { precision: 5, scale: 2 }),
  valorMedido: numeric("valor_medido", { precision: 15, scale: 2 }),
  descricao: text(),
  fotosUrls: json("fotos_urls"),
  relatorioUrl: text("relatorio_url"),
  status: text().default("pendente").notNull(),
  motivoRecusa: text("motivo_recusa"),
  aprovadorId: integer("aprovador_id"),
  aprovadorNome: varchar("aprovador_nome", { length: 255 }),
  aprovadoEm: timestamp("aprovado_em", { mode: "string" }),
  enviadoEm: timestamp("enviado_em", { mode: "string" }).defaultNow(),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("idx_scm_contract").on(t.contractId),
  index("idx_scm_company").on(t.companyId),
  index("idx_scm_status").on(t.status),
]);

export const serviceContractDocuments = pgTable("service_contract_documents", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  contractId: integer("contract_id").notNull(),
  supplierId: integer("supplier_id").notNull(),
  tipo: varchar({ length: 100 }).notNull(),
  nome: varchar({ length: 255 }).notNull(),
  arquivoUrl: text("arquivo_url"),
  dataValidade: date("data_validade", { mode: "string" }),
  observacoes: text(),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("idx_scd_contract").on(t.contractId),
  index("idx_scd_company").on(t.companyId),
]);

export const serviceContractActionLogs = pgTable("service_contract_action_logs", {
  id: serial().notNull(),
  companyId: integer("company_id").notNull(),
  contractId: integer("contract_id").notNull(),
  supplierId: integer("supplier_id"),
  userId: integer("user_id"),
  userName: varchar("user_name", { length: 255 }),
  acao: varchar({ length: 100 }).notNull(),
  detalhes: text(),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("idx_scal_contract").on(t.contractId),
  index("idx_scal_company").on(t.companyId),
]);

export const integrasignEnvelopes = pgTable("integrasign_envelopes", {
  id: serial().primaryKey(),
  companyId: integer("company_id").notNull(),
  contratoTerceiroId: integer("contrato_terceiro_id"),
  ordemCompraId: integer("ordem_compra_id"),
  obraId: integer("obra_id"),
  titulo: varchar({ length: 500 }).notNull(),
  descricao: text(),
  status: varchar({ length: 50 }).notNull().default("rascunho"),
  versao: integer().notNull().default(1),
  versaoAnteriorId: integer("versao_anterior_id"),
  pdfOriginalUrl: text("pdf_original_url"),
  pdfAssinadoUrl: text("pdf_assinado_url"),
  textoContrato: text("texto_contrato"),
  hashDocumento: varchar("hash_documento", { length: 128 }),
  totalSignatariosObrigatorios: integer("total_signatarios_obrigatorios").notNull().default(4),
  totalAssinaturasRealizadas: integer("total_assinaturas_realizadas").notNull().default(0),
  criadoPorId: integer("criado_por_id"),
  criadoPorNome: varchar("criado_por_nome", { length: 255 }),
  motivoCancelamento: text("motivo_cancelamento"),
  motivoRecusa: text("motivo_recusa"),
  recusadoPorNome: varchar("recusado_por_nome", { length: 255 }),
  dataEnvio: timestamp("data_envio", { mode: "string" }),
  dataConclusao: timestamp("data_conclusao", { mode: "string" }),
  dataExpiracao: timestamp("data_expiracao", { mode: "string" }),
  dataCancelamento: timestamp("data_cancelamento", { mode: "string" }),
  criadoEm: timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em", { mode: "string" }).defaultNow().notNull(),
  excluidoEm: timestamp("excluido_em", { mode: "string" }),
}, (t) => [
  index("idx_isenv_company").on(t.companyId),
  index("idx_isenv_contrato").on(t.contratoTerceiroId),
  index("idx_isenv_ordem").on(t.ordemCompraId),
  index("idx_isenv_status").on(t.status),
]);

export const integrasignSignatarios = pgTable("integrasign_signatarios", {
  id: serial().primaryKey(),
  companyId: integer("company_id").notNull(),
  envelopeId: integer("envelope_id").notNull(),
  papel: varchar({ length: 50 }).notNull(),
  ordemAssinatura: integer("ordem_assinatura").notNull().default(0),
  nome: varchar({ length: 255 }).notNull(),
  email: varchar({ length: 255 }).notNull(),
  cpfCnpj: varchar("cpf_cnpj", { length: 20 }),
  cargo: varchar({ length: 255 }),
  empresaNome: varchar("empresa_nome", { length: 255 }),
  token: varchar({ length: 128 }).notNull(),
  tokenExpiraEm: timestamp("token_expira_em", { mode: "string" }).notNull(),
  status: varchar({ length: 50 }).notNull().default("pendente"),
  assinaturaImagem: text("assinatura_imagem"),
  rubricaImagem: text("rubrica_imagem"),
  hashAssinatura: varchar("hash_assinatura", { length: 128 }),
  hashRubrica: varchar("hash_rubrica", { length: 128 }),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  latitude: numeric({ precision: 12, scale: 8 }),
  longitude: numeric({ precision: 12, scale: 8 }),
  geoAccuracy: numeric("geo_accuracy", { precision: 10, scale: 2 }),
  dispositivoInfo: text("dispositivo_info"),
  termoAceito: boolean("termo_aceito").default(false),
  textoTermo: text("texto_termo"),
  nomeConfirmado: varchar("nome_confirmado", { length: 255 }),
  cpfCnpjConfirmado: varchar("cpf_cnpj_confirmado", { length: 20 }),
  motivoRecusa: text("motivo_recusa"),
  dataNotificacao: timestamp("data_notificacao", { mode: "string" }),
  dataVisualizacao: timestamp("data_visualizacao", { mode: "string" }),
  dataAssinatura: timestamp("data_assinatura", { mode: "string" }),
  dataRecusa: timestamp("data_recusa", { mode: "string" }),
  dataLembrete: timestamp("data_lembrete", { mode: "string" }),
  criadoEm: timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("idx_issig_company").on(t.companyId),
  index("idx_issig_envelope").on(t.envelopeId),
  index("idx_issig_token").on(t.token),
  index("idx_issig_status").on(t.status),
  index("idx_issig_papel").on(t.papel),
]);

export const integrasignAuditLog = pgTable("integrasign_audit_log", {
  id: serial().primaryKey(),
  companyId: integer("company_id").notNull(),
  envelopeId: integer("envelope_id").notNull(),
  signatarioId: integer("signatario_id"),
  acao: varchar({ length: 100 }).notNull(),
  detalhes: text(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  userId: integer("user_id"),
  userName: varchar("user_name", { length: 255 }),
  criadoEm: timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("idx_isaud_company").on(t.companyId),
  index("idx_isaud_envelope").on(t.envelopeId),
]);

export const databookFichas = pgTable("databook_fichas", {
  id: serial().primaryKey(),
  companyId: integer("company_id").notNull(),
  obraId: integer("obra_id").notNull(),
  numeroSequencial: integer("numero_sequencial").notNull().default(0),
  origem: varchar({ length: 20 }).notNull().default("oc"),
  ordemId: integer("ordem_id"),
  ordemItemId: integer("ordem_item_id"),
  terceiroContratoId: integer("terceiro_contrato_id"),
  terceiroEntregaId: integer("terceiro_entrega_id"),
  fornecedorId: integer("fornecedor_id"),
  fornecedorNome: varchar("fornecedor_nome", { length: 255 }),
  contratoNumero: varchar("contrato_numero", { length: 50 }),
  descricao: text().notNull(),
  disciplina: varchar({ length: 50 }).default("Outros"),
  especificacoes: text(),
  fotoUrl: text("foto_url"),
  observacoes: text(),
  eapCodigo: varchar("eap_codigo", { length: 100 }),
  insumoCodigo: varchar("insumo_codigo", { length: 100 }),
  hashProduto: varchar("hash_produto", { length: 64 }),
  fornecedoresConsolidados: text("fornecedores_consolidados"),
  status: varchar({ length: 30 }).notNull().default("pendente_ia"),
  iaValidado: boolean("ia_validado").default(false),
  iaAlertas: text("ia_alertas"),
  iaScore: integer("ia_score"),
  revisadoPor: varchar("revisado_por", { length: 255 }),
  revisadoEm: timestamp("revisado_em", { mode: "string" }),
  enviadoEm: timestamp("enviado_em", { mode: "string" }),
  enviadoPor: varchar("enviado_por", { length: 255 }),
  aprovadoCliente: boolean("aprovado_cliente"),
  aprovadoClientePor: varchar("aprovado_cliente_por", { length: 255 }),
  aprovadoClienteEm: timestamp("aprovado_cliente_em", { mode: "string" }),
  reprovadoMotivo: text("reprovado_motivo"),
  versao: integer().default(1),
  geradoPor: varchar("gerado_por", { length: 255 }),
  geradoEm: timestamp("gerado_em", { mode: "string" }),
  pdfUrl: text("pdf_url"),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("idx_databook_fichas_obra").on(t.companyId, t.obraId),
  index("idx_databook_fichas_status").on(t.status),
]);

export const databookTerceiroEntregas = pgTable("databook_terceiro_entregas", {
  id: serial().primaryKey(),
  companyId: integer("company_id").notNull(),
  obraId: integer("obra_id").notNull(),
  terceiroContratoId: integer("terceiro_contrato_id").notNull(),
  empresaTerceiraId: integer("empresa_terceira_id"),
  descricao: text().notNull(),
  fabricante: varchar({ length: 255 }),
  modelo: varchar({ length: 255 }),
  especificacoes: text(),
  fotoUrl: text("foto_url"),
  observacoes: text(),
  notaFiscalUrl: text("nota_fiscal_url"),
  iaValidado: boolean("ia_validado").default(false),
  iaAlertas: text("ia_alertas"),
  iaCorrecoes: text("ia_correcoes"),
  iaScore: integer("ia_score"),
  status: varchar({ length: 30 }).notNull().default("pendente"),
  aprovadoPor: varchar("aprovado_por", { length: 255 }),
  aprovadoEm: timestamp("aprovado_em", { mode: "string" }),
  reprovadoMotivo: text("reprovado_motivo"),
  cadastradoPor: varchar("cadastrado_por", { length: 255 }),
  cadastradoEm: timestamp("cadastrado_em", { mode: "string" }).defaultNow(),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("idx_databook_terceiro_contrato").on(t.terceiroContratoId),
]);

export const disciplinaClassificacoes = pgTable("disciplina_classificacoes", {
  id:               serial().primaryKey(),
  companyId:        integer("company_id").notNull(),
  orcamentoId:      integer("orcamento_id").notNull(),
  disciplina:       varchar({ length: 200 }).notNull(),
  eapCodigo:        varchar("eap_codigo", { length: 50 }).notNull(),
  descricaoItem:    text("descricao_item"),
  classificadoPor:  varchar("classificado_por", { length: 20 }).default("ia"),
  criadoEm:         timestamp("criado_em", { mode: "string" }).defaultNow(),
}, (t) => [
  index("idx_disc_class_orc").on(t.orcamentoId),
  index("idx_disc_class_company").on(t.companyId),
]);

export const employeeStatusLog = pgTable("employee_status_log", {
  id:                serial().primaryKey(),
  companyId:         integer("companyId").notNull(),
  employeeId:        integer("employeeId").notNull(),
  nomeCompleto:      varchar("nomeCompleto", { length: 255 }),
  statusAnterior:    varchar("statusAnterior", { length: 50 }),
  statusNovo:        varchar("statusNovo", { length: 50 }).notNull(),
  alteradoPor:       varchar("alteradoPor", { length: 255 }).notNull().default("Sistema"),
  alteradoPorUserId: integer("alteradoPorUserId"),
  motivo:            text("motivo"),
  origemModulo:      varchar("origemModulo", { length: 100 }),
  createdAt:         timestamp("createdAt", { mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("idx_esl_employee").on(t.employeeId),
  index("idx_esl_company").on(t.companyId),
]);

export const employeeTerminationChecklist = pgTable("employee_termination_checklist", {
  id: serial().primaryKey(),
  companyId: integer("company_id").notNull(),
  employeeId: integer("employee_id").notNull(),
  item: varchar("item", { length: 100 }).notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  obrigatorio: smallint("obrigatorio").default(1).notNull(),
  concluido: smallint("concluido").default(0).notNull(),
  concluidoEm: timestamp("concluido_em", { mode: "string" }),
  concluidoPor: varchar("concluido_por", { length: 255 }),
  concluidoPorUserId: integer("concluido_por_user_id"),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("idx_etc_company").on(t.companyId),
  index("idx_etc_employee").on(t.employeeId),
]);

// ── Módulo SMO — Solicitação de Mão de Obra ──────────────────────────────
export const smoSolicitacoes = pgTable("smo_solicitacoes", {
  id:                  serial().primaryKey(),
  companyId:           integer("company_id").notNull(),
  obraId:              integer("obra_id").notNull(),
  solicitanteId:       integer("solicitante_id").notNull(),
  solicitanteNome:     varchar("solicitante_nome", { length: 255 }).notNull(),
  funcaoSolicitada:    varchar("funcao_solicitada", { length: 150 }).notNull(),
  quantidade:          integer().notNull().default(1),
  dataInicioNecessidade: date("data_inicio_necessidade", { mode: "string" }).notNull(),
  duracaoMeses:        integer("duracao_meses").notNull().default(1),
  prioridade:          varchar({ length: 20 }).notNull().default("normal"),
  qualificacoes:       text(),
  observacao:          text(),
  status:              varchar({ length: 30 }).notNull().default("rascunho"),
  custoMensalEstimado: numeric("custo_mensal_estimado", { precision: 18, scale: 2 }).default("0"),
  custoTotalEstimado:  numeric("custo_total_estimado", { precision: 18, scale: 2 }).default("0"),
  detalheCustos:       text("detalhe_custos"),
  sugestaoRealocacao:  text("sugestao_realocacao"),
  motivoRejeicao:      text("motivo_rejeicao"),
  aprovadoPorCoord:    varchar("aprovado_por_coord", { length: 255 }),
  aprovadoPorCoordEm:  timestamp("aprovado_por_coord_em", { mode: "string" }),
  aprovadoPorRh:       varchar("aprovado_por_rh", { length: 255 }),
  aprovadoPorRhEm:     timestamp("aprovado_por_rh_em", { mode: "string" }),
  aprovadoPorDiretoria: varchar("aprovado_por_diretoria", { length: 255 }),
  aprovadoPorDiretoriaEm: timestamp("aprovado_por_diretoria_em", { mode: "string" }),
  rejeitadoPor:        varchar("rejeitado_por", { length: 255 }),
  rejeitadoEm:         timestamp("rejeitado_em", { mode: "string" }),
  prazoMinimoAlerta:   boolean("prazo_minimo_alerta").default(false),
  slaVencidoEm:        timestamp("sla_vencido_em", { mode: "string" }),
  criadoEm:            timestamp("criado_em", { mode: "string" }).defaultNow(),
  atualizadoEm:        timestamp("atualizado_em", { mode: "string" }).defaultNow(),
  candidatoIndicadoNome: varchar("candidato_indicado_nome", { length: 255 }),
  candidatoIndicadoTelefone: varchar("candidato_indicado_telefone", { length: 50 }),
  curriculoArquivoNome: varchar("curriculo_arquivo_nome", { length: 255 }),
  curriculoArquivoKey: varchar("curriculo_arquivo_key", { length: 500 }),
  loteId:              varchar("lote_id", { length: 50 }),
  qtdEmAndamento:      integer("qtd_em_andamento").default(0),
  regimeContratacao:   varchar("regime_contratacao", { length: 20 }).default("experiencia"),
  deletedAt:           timestamp("deleted_at", { mode: "string" }),
}, (t) => [
  index("idx_smo_company").on(t.companyId),
  index("idx_smo_obra").on(t.obraId),
  index("idx_smo_status").on(t.status),
]);

export const smoAtividadesEap = pgTable("smo_atividades_eap", {
  id:              serial().primaryKey(),
  solicitacaoId:   integer("solicitacao_id").notNull(),
  atividadeId:     integer("atividade_id").notNull(),
  eapCodigo:       varchar("eap_codigo", { length: 50 }),
  nomeAtividade:   varchar("nome_atividade", { length: 500 }),
}, (t) => [
  index("idx_smo_eap_sol").on(t.solicitacaoId),
]);

export const smoOnboardingChecklist = pgTable("smo_onboarding_checklist", {
  id:              serial().primaryKey(),
  solicitacaoId:   integer("solicitacao_id").notNull(),
  employeeId:      integer("employee_id"),
  item:            varchar({ length: 255 }).notNull(),
  concluido:       boolean().default(false),
  concluidoPor:    varchar("concluido_por", { length: 255 }),
  concluidoEm:     timestamp("concluido_em", { mode: "string" }),
  criadoEm:        timestamp("criado_em", { mode: "string" }).defaultNow(),
}, (t) => [
  index("idx_smo_onb_sol").on(t.solicitacaoId),
]);

export const disciplinaCorrecoes = pgTable("disciplina_correcoes", {
  id:                    serial().primaryKey(),
  companyId:             integer("company_id").notNull(),
  eapDescricao:          text("eap_descricao").notNull(),
  disciplinaOriginal:    varchar("disciplina_original", { length: 200 }).notNull(),
  disciplinaCorrigida:   varchar("disciplina_corrigida", { length: 200 }).notNull(),
  userId:                integer("user_id"),
  userName:              varchar("user_name", { length: 200 }),
  criadoEm:              timestamp("criado_em", { mode: "string" }).defaultNow(),
}, (t) => [
  index("idx_disc_corr_company").on(t.companyId),
]);

// ============================================================
// SEGURO DE VIDA — Cobertura por funcionário
// ============================================================
export const seguroVidaCoberturas = pgTable("seguro_vida_coberturas", {
  id:                   serial().primaryKey(),
  companyId:            integer("company_id").notNull(),
  employeeId:           integer("employee_id"),
  nomeCompleto:         varchar("nome_completo", { length: 300 }).notNull(),
  itemSegurador:        varchar("item_segurador", { length: 20 }),
  apoliceVG:            varchar("apolice_vg", { length: 30 }),
  apoliceAPC:           varchar("apolice_apc", { length: 30 }),
  status:               varchar("status", { length: 30 }).notNull().default("ativo"),
  dataAdesao:           date("data_adesao"),
  dataCancelamento:     date("data_cancelamento"),
  motivoCancelamento:   text("motivo_cancelamento"),
  observacoes:          text("observacoes"),
  criadoEm:             timestamp("criado_em", { mode: "string" }).defaultNow(),
  atualizadoEm:         timestamp("atualizado_em", { mode: "string" }).defaultNow(),
  criadoPor:            varchar("criado_por", { length: 255 }),
  canceladoPor:         varchar("cancelado_por", { length: 255 }),
}, (t) => [
  index("idx_seguro_vida_company").on(t.companyId),
  index("idx_seguro_vida_employee").on(t.employeeId),
  index("idx_seguro_vida_status").on(t.status),
]);

export const seguroVidaImportacoes = pgTable("seguro_vida_importacoes", {
  id:                   serial().primaryKey(),
  companyId:            integer("company_id").notNull(),
  competencia:          varchar("competencia", { length: 7 }).notNull(),
  dataImportacao:       timestamp("data_importacao", { mode: "string" }).defaultNow(),
  totalSegurados:       integer("total_segurados").default(0),
  totalAtivos:          integer("total_ativos").default(0),
  totalOk:              integer("total_ok").default(0),
  totalSemSeguro:       integer("total_sem_seguro").default(0),
  totalPagarIndevido:   integer("total_pagar_indevido").default(0),
  totalNovos:           integer("total_novos").default(0),
  jsonResultado:        json("json_resultado"),
  relatorioNomes:       text("relatorio_nomes"),
  importadoPor:         varchar("importado_por", { length: 255 }),
  criadoEm:             timestamp("criado_em", { mode: "string" }).defaultNow(),
}, (t) => [
  index("idx_svimport_company").on(t.companyId),
  index("idx_svimport_competencia").on(t.competencia),
]);

// ============================================================
// ORÁCULO — Assistente IA Analítico (admin_master only)
// ============================================================
export const oraculoSessions = pgTable("oraculo_sessions", {
  id:           serial().primaryKey(),
  userId:       integer("user_id").notNull(),
  userName:     varchar("user_name", { length: 255 }),
  companyId:    integer("company_id"),
  title:        varchar("title", { length: 500 }).default("Nova conversa"),
  messageCount: integer("message_count").default(0),
  createdAt:    timestamp("created_at", { mode: "string" }).defaultNow(),
  updatedAt:    timestamp("updated_at", { mode: "string" }).defaultNow(),
}, (t) => [
  index("idx_oraculo_sessions_user").on(t.userId),
  index("idx_oraculo_sessions_updated").on(t.updatedAt),
]);

export const oraculoMessages = pgTable("oraculo_messages", {
  id:        serial().primaryKey(),
  sessionId: integer("session_id").notNull(),
  role:      varchar("role", { length: 20 }).notNull(),
  content:   text("content").notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow(),
}, (t) => [
  index("idx_oraculo_messages_session").on(t.sessionId),
]);

export const comunicadosInternos = pgTable("comunicados_internos", {
  id: serial().primaryKey(),
  companyId: integer("company_id").notNull(),
  numero: varchar({ length: 20 }).notNull(),
  ano: integer().notNull(),
  sequencia: integer().notNull(),
  titulo: varchar({ length: 255 }).notNull(),
  dataEmissao: date("data_emissao", { mode: "string" }).notNull(),
  conteudo: text(),
  documentoUrl: text("documento_url"),
  fileName: varchar("file_name", { length: 255 }),
  criadoPor: varchar("criado_por", { length: 255 }),
  criadoPorUserId: integer("criado_por_user_id"),
  status: varchar({ length: 20 }).default("rascunho").notNull(),
  concluidoPor: varchar("concluido_por", { length: 255 }),
  concluidoPorUserId: integer("concluido_por_user_id"),
  concluidoEm: timestamp("concluido_em", { mode: "string" }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "string" }),
  deletedBy: varchar("deleted_by", { length: 255 }),
  deletedByUserId: integer("deleted_by_user_id"),
  // Rev. 4264 — setor emissor, responsável, destinatários selecionados e link FCSign
  setor: varchar({ length: 255 }),
  emissorNome: varchar("emissor_nome", { length: 255 }),
  emissorCargo: varchar("emissor_cargo", { length: 255 }),
  destinatariosJson: text("destinatarios_json"),
  fcsignEnvelopeId: integer("fcsign_envelope_id"),
}, (t) => [
  index("idx_comunicados_company").on(t.companyId),
  index("idx_comunicados_ano").on(t.companyId, t.ano),
  uniqueIndex("uq_comunicados_company_ano_seq").on(t.companyId, t.ano, t.sequencia),
]);

// Rev. 2079 — Assinaturas digitais coletadas em listas de assinatura de Comunicados Internos.
// 1 linha por (comunicadoId, employeeId). assinaturaBase64 guarda PNG data URL do canvas.
export const comunicadoAssinaturas = pgTable("comunicado_assinaturas", {
  id: serial().primaryKey(),
  comunicadoId: integer("comunicado_id").notNull(),
  companyId: integer("company_id").notNull(),
  employeeId: integer("employee_id").notNull(),
  assinaturaBase64: text("assinatura_base64").notNull(),
  assinadoEm: timestamp("assinado_em", { mode: "string" }).defaultNow().notNull(),
  ip: varchar({ length: 64 }),
  registradoPor: varchar("registrado_por", { length: 255 }),
  registradoPorUserId: integer("registrado_por_user_id"),
}, (t) => [
  index("idx_com_assin_comunicado").on(t.comunicadoId),
  index("idx_com_assin_company").on(t.companyId),
  uniqueIndex("uq_com_assin_comunicado_emp").on(t.comunicadoId, t.employeeId),
]);

export const curriculoFuncoes = pgTable("curriculo_funcoes", {
  id: serial().primaryKey(),
  companyId: integer("company_id").notNull(),
  nome: varchar({ length: 120 }).notNull(),
  ativo: smallint().default(1),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "string" }),
}, (t) => [
  index("idx_curriculo_funcoes_company").on(t.companyId),
]);

export const curriculos = pgTable("curriculos", {
  id: serial().primaryKey(),
  companyId: integer("company_id").notNull(),
  funcaoId: integer("funcao_id"),
  funcaoNome: varchar("funcao_nome", { length: 120 }).notNull(),
  nomeCandidato: varchar("nome_candidato", { length: 255 }).default(""),
  telefone: varchar({ length: 30 }),
  email: varchar({ length: 255 }),
  endereco: varchar({ length: 500 }),
  cidade: varchar({ length: 150 }),
  estado: varchar({ length: 2 }),
  dataNascimento: date("data_nascimento", { mode: "string" }),
  statusCandidato: varchar("status_candidato", { length: 30 }).default("ativo").notNull(),
  motivoReprovacao: text("motivo_reprovacao"),
  statusAtualizadoEm: timestamp("status_atualizado_em", { mode: "string" }),
  statusAtualizadoPor: varchar("status_atualizado_por", { length: 255 }),
  habilidades: text(),
  escolaridade: varchar({ length: 255 }),
  cursoFormacao: text("curso_formacao"),
  historicoStatusJson: text("historico_status_json"),
  experienciasJson: text("experiencias_json"),
  observacoes: text(),
  documentoUrl: text("documento_url"),
  fileName: varchar("file_name", { length: 255 }),
  criadoPor: varchar("criado_por", { length: 255 }),
  criadoPorUserId: integer("criado_por_user_id"),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "string" }),
  deletedBy: varchar("deleted_by", { length: 255 }),
  deletedByUserId: integer("deleted_by_user_id"),
}, (t) => [
  index("idx_curriculos_company").on(t.companyId),
  index("idx_curriculos_funcao").on(t.companyId, t.funcaoId),
]);

export const recycleBin = pgTable("recycle_bin", {
  id:               serial().primaryKey(),
  entityType:       varchar("entity_type", { length: 80 }).notNull(),
  entityId:         integer("entity_id").notNull(),
  companyId:        integer("company_id"),
  obraId:           integer("obra_id"),
  parentEntity:     varchar("parent_entity", { length: 80 }),
  parentId:         integer("parent_id"),
  label:            text("label").notNull(),
  snapshot:         json("snapshot").notNull(),
  deletedBy:        varchar("deleted_by", { length: 255 }),
  deletedByUserId:  integer("deleted_by_user_id"),
  deletedAt:        timestamp("deleted_at", { mode: "string" }).defaultNow(),
  restoredAt:       timestamp("restored_at", { mode: "string" }),
}, (t) => [
  index("idx_recycle_company").on(t.companyId),
  index("idx_recycle_entity").on(t.entityType, t.entityId),
  index("idx_recycle_deleted_at").on(t.deletedAt),
]);

export const sstDocuments = pgTable("sst_documents", {
  id: serial().primaryKey().notNull(),
  companyId: integer("company_id").notNull(),
  obraId: integer("obra_id"),
  tipo: varchar({ length: 20 }).notNull(),
  descricao: varchar({ length: 255 }),
  dataElaboracao: date("data_elaboracao", { mode: "string" }),
  dataValidade: date("data_validade", { mode: "string" }),
  responsavelElaboracao: varchar("responsavel_elaboracao", { length: 255 }),
  registroProfissional: varchar("registro_profissional", { length: 100 }),
  empresaElaboradora: varchar("empresa_elaboradora", { length: 255 }),
  arquivoUrl: text("arquivo_url"),
  arquivoNome: varchar("arquivo_nome", { length: 255 }),
  observacoes: text(),
  criadoPor: varchar("criado_por", { length: 255 }),
  criadoPorUserId: integer("criado_por_user_id"),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "string" }),
  deletedBy: varchar("deleted_by", { length: 255 }),
  deletedByUserId: integer("deleted_by_user_id"),
}, (t) => [
  index("idx_sstdoc_company").on(t.companyId),
  index("idx_sstdoc_tipo").on(t.tipo),
  index("idx_sstdoc_obra").on(t.obraId),
]);

// ============================================================
// MÓDULO SST — Integração de Segurança (Treinamento de Novos Colaboradores)
// ============================================================

export const sstIntegracaoConfig = pgTable("sst_integracao_config", {
  id: serial().primaryKey(),
  companyId: integer("company_id").notNull(),
  obraId: integer("obra_id"),
  obraNome: varchar("obra_nome", { length: 255 }),
  titulo: varchar({ length: 255 }).notNull(),
  descricao: text(),
  notaMinima: integer("nota_minima").default(70).notNull(),
  validadeMeses: integer("validade_meses").default(12).notNull(),
  ativo: boolean().default(true).notNull(),
  criadoPor: varchar("criado_por", { length: 255 }),
  criadoPorUserId: integer("criado_por_user_id"),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "string" }),
});

export const sstIntegracaoModulos = pgTable("sst_integracao_modulos", {
  id: serial().primaryKey(),
  configId: integer("config_id").notNull(),
  companyId: integer("company_id").notNull(),
  titulo: varchar({ length: 255 }).notNull(),
  descricao: text(),
  videoUrl: text("video_url"),
  videoTipo: varchar("video_tipo", { length: 30 }).default("youtube"),
  ordem: integer().default(1).notNull(),
  obrigatorio: boolean().default(true).notNull(),
  funcoesJson: text("funcoes_json"),
  duracaoMinutos: integer("duracao_minutos"),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "string" }),
});

export const sstIntegracaoPerguntas = pgTable("sst_integracao_perguntas", {
  id: serial().primaryKey(),
  moduloId: integer("modulo_id").notNull(),
  companyId: integer("company_id").notNull(),
  texto: text().notNull(),
  tipo: varchar({ length: 30 }).default("multipla_escolha").notNull(),
  ordem: integer().default(1).notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
});

export const sstIntegracaoAlternativas = pgTable("sst_integracao_alternativas", {
  id: serial().primaryKey(),
  perguntaId: integer("pergunta_id").notNull(),
  texto: text().notNull(),
  correta: boolean().default(false).notNull(),
  ordem: integer().default(1).notNull(),
});

export const sstIntegracaoRegistros = pgTable("sst_integracao_registros", {
  id: serial().primaryKey(),
  companyId: integer("company_id").notNull(),
  employeeId: integer("employee_id").notNull(),
  employeeNome: varchar("employee_nome", { length: 255 }),
  employeeCpf: varchar("employee_cpf", { length: 14 }),
  employeeFuncao: varchar("employee_funcao", { length: 255 }),
  configId: integer("config_id"),
  obraId: integer("obra_id"),
  obraNome: varchar("obra_nome", { length: 255 }),
  status: varchar({ length: 30 }).default("pendente").notNull(),
  origem: varchar({ length: 30 }).default("manual").notNull(),
  smoId: integer("smo_id"),
  nota: numeric({ precision: 5, scale: 2 }),
  tentativas: integer().default(0).notNull(),
  dataRealizacao: timestamp("data_realizacao", { mode: "string" }),
  dataValidade: timestamp("data_validade", { mode: "string" }),
  certificadoUrl: text("certificado_url"),
  envelopeId: integer("envelope_id"),
  token: varchar({ length: 100 }),
  sessaoId: integer("sessao_id"),
  responsavel: varchar({ length: 255 }),
  responsavelId: integer("responsavel_id"),
  // Rev. 2052 — Assinatura digital do TST (FCSign inline canvas)
  // base64 PNG da assinatura desenhada no canvas + nome do TST que assinou
  // + timestamp da assinatura. Embutida no PDF do certificado.
  assinaturaTstBase64: text("assinatura_tst_base64"),
  assinaturaTstNome: varchar("assinatura_tst_nome", { length: 255 }),
  assinaturaTstAssinadaEm: timestamp("assinatura_tst_assinada_em", { mode: "string" }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "string" }),
}, (t) => [
  index("idx_sst_integ_reg_company").on(t.companyId),
  index("idx_sst_integ_reg_employee").on(t.employeeId),
  index("idx_sst_integ_reg_token").on(t.token),
  index("idx_sst_integ_reg_status").on(t.status),
]);

export const sstIntegracaoRespostas = pgTable("sst_integracao_respostas", {
  id: serial().primaryKey(),
  registroId: integer("registro_id").notNull(),
  perguntaId: integer("pergunta_id").notNull(),
  alternativaId: integer("alternativa_id"),
  correta: boolean().default(false).notNull(),
  tentativa: integer().default(1).notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
});

export const sstIntegracaoSessoes = pgTable("sst_integracao_sessoes", {
  id: serial().primaryKey(),
  companyId: integer("company_id").notNull(),
  obraId: integer("obra_id"),
  obraNome: varchar("obra_nome", { length: 255 }),
  titulo: varchar({ length: 255 }),
  dataSessao: timestamp("data_sessao", { mode: "string" }),
  responsavel: varchar({ length: 255 }),
  responsavelId: integer("responsavel_id"),
  tipo: varchar({ length: 30 }).default("individual").notNull(),
  status: varchar({ length: 30 }).default("agendada").notNull(),
  observacoes: text(),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
});

// ===================== DDS — Diálogo Diário de Segurança (Rev. 1726) =====================
// Módulo de Diálogos Diários de Segurança (NR-1 / NR-18). Cobre:
//  - Biblioteca de temas (NRs + campanhas governamentais mensais)
//  - Sessões DDS (vinculadas a obra ou avulsas)
//  - Lista de presença (funcionários + assinatura via FCsign)
export const ddsTemas = pgTable("dds_temas", {
  id: serial().primaryKey(),
  companyId: integer("company_id").notNull(),
  codigo: varchar({ length: 30 }),                    // ex.: NR-35, MAIO-AMARELO, LIVRE-001
  titulo: varchar({ length: 255 }).notNull(),
  descricao: text(),                                  // resumo curto pro card
  conteudoMd: text("conteudo_md"),                    // texto completo do DDS (markdown)
  normaReferencia: varchar("norma_referencia", { length: 120 }),
  categoria: varchar({ length: 30 }).default("LIVRE").notNull(), // 'NR' | 'CAMPANHA' | 'LIVRE'
  // Rev. 1960 — Sub-classificação por ÁREA TEMÁTICA (vocabulário fechado em `shared/ddsAreas.ts`:
  // ALTURA, ELETRICA, MAQUINAS, ESCAVACAO, ESPACO_CONFINADO, SOLDAGEM, QUIMICOS, INCENDIO,
  // ERGONOMIA, EPI, SAUDE, TRANSITO, EMERGENCIA, CONDUTA, DOCUMENTACAO, AMBIENTE, GERAL).
  // Atribuída automaticamente pela IA ao gerar roteiro/tema. Pode ser editada manualmente.
  // Null = não classificado (UI trata como "GERAL"). Ortogonal a `categoria`.
  areaTema: varchar("area_tema", { length: 40 }),
  mesCampanha: integer("mes_campanha"),               // 1..12 quando categoria='CAMPANHA'
  corCampanha: varchar("cor_campanha", { length: 30 }), // ex.: amarelo, rosa, azul
  duracaoMin: integer("duracao_min").default(15),
  ativo: integer().default(1).notNull(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "string" }),
}, (t) => [
  index("idx_dds_temas_company").on(t.companyId),
  index("idx_dds_temas_categoria").on(t.categoria),
  index("idx_dds_temas_area_tema").on(t.areaTema),
]);

export const ddsSessoes = pgTable("dds_sessoes", {
  id: serial().primaryKey(),
  companyId: integer("company_id").notNull(),
  obraId: integer("obra_id"),                         // null = avulsa/escritório
  obraNome: varchar("obra_nome", { length: 255 }),
  data: date({ mode: "string" }).notNull(),
  hora: varchar({ length: 8 }),                       // HH:MM
  temaId: integer("tema_id"),                         // FK opcional p/ ddsTemas
  tituloTema: varchar("titulo_tema", { length: 255 }).notNull(),
  conteudoMd: text("conteudo_md"),                    // snapshot do tema na hora da sessão
  instrutor: varchar({ length: 255 }),
  instrutorCpf: varchar("instrutor_cpf", { length: 14 }),
  instrutorCodigoInterno: varchar("instrutor_codigo_interno", { length: 50 }),
  // Rev. 1876 — Override de categoria por sessão (NR | CAMPANHA | VACINACAO | LIVRE).
  // Null = herda da categoria do tema vinculado (`dds_temas.categoria` via temaId).
  // Permite ao engenheiro "informar a categoria" diretamente na linha da sessão,
  // sem precisar editar o tema (que afetaria TODAS as outras sessões dele).
  categoria: varchar({ length: 30 }),
  local: varchar({ length: 255 }),
  observacoes: text(),
  status: varchar({ length: 20 }).default("aberta").notNull(), // 'aberta' | 'finalizada' | 'cancelada'
  envelopeId: integer("envelope_id"),                 // FCsign envelope quando enviado para assinatura
  createdBy: integer("created_by"),
  finalizadaEm: timestamp("finalizada_em", { mode: "string" }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "string" }),
}, (t) => [
  index("idx_dds_sessoes_company").on(t.companyId),
  index("idx_dds_sessoes_obra").on(t.obraId),
  index("idx_dds_sessoes_data").on(t.data),
  index("idx_dds_sessoes_status").on(t.status),
]);

export const ddsSessaoFuncionarios = pgTable("dds_sessao_funcionarios", {
  id: serial().primaryKey(),
  sessaoId: integer("sessao_id").notNull(),
  employeeId: integer("employee_id"),                 // null = funcionário avulso
  nome: varchar({ length: 255 }).notNull(),
  cpf: varchar({ length: 14 }),
  funcao: varchar({ length: 120 }),
  presente: integer().default(1).notNull(),
  assinaturaTipo: varchar("assinatura_tipo", { length: 20 }), // 'fcsign' | 'manual' | 'desenhada' | null
  assinadoEm: timestamp("assinado_em", { mode: "string" }),
  assinaturaImg: text("assinatura_img"), // PNG base64 dataURL (assinatura desenhada na tela — Rev. 1746)
  observacao: text(),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (t) => [
  index("idx_dds_sf_sessao").on(t.sessaoId),
  index("idx_dds_sf_emp").on(t.employeeId),
]);

// ============================================================================
// Rev. 1880 — Controle de Ferramentas de Terceiros (portaria de obra)
// ============================================================================
export const ferramentasTerceirosRegistros = pgTable("ferramentas_terceiros_registros", {
  id: serial().primaryKey(),
  companyId: integer("company_id").notNull(),
  obraId: integer("obra_id"),
  obraNome: varchar("obra_nome", { length: 255 }),
  tipo: varchar({ length: 10 }).notNull(),               // ENTRADA | SAIDA
  dataHora: timestamp("data_hora", { mode: 'string' }).defaultNow().notNull(),
  empresaTerceira: varchar("empresa_terceira", { length: 255 }).notNull(),
  cnpj: varchar({ length: 20 }),
  responsavelNome: varchar("responsavel_nome", { length: 255 }).notNull(),
  responsavelCpf: varchar("responsavel_cpf", { length: 14 }),
  responsavelTelefone: varchar("responsavel_telefone", { length: 20 }),
  quemEntregou: varchar("quem_entregou", { length: 255 }),
  quemRecebeu: varchar("quem_recebeu", { length: 255 }),
  lancadoPorUserId: integer("lancado_por_user_id"),
  lancadoPorNome: varchar("lancado_por_nome", { length: 255 }),
  registroPaiId: integer("registro_pai_id"),             // se tipo=SAIDA → aponta p/ ENTRADA original
  fotoDocumentoUrl: text("foto_documento_url"),          // RG/CNH do responsável
  observacoes: text(),
  status: varchar({ length: 20 }).default('em_obra').notNull(),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: 'string' }),
});

export const ferramentasTerceirosItens = pgTable("ferramentas_terceiros_itens", {
  id: serial().primaryKey(),
  registroId: integer("registro_id").notNull(),
  companyId: integer("company_id").notNull(),
  descricao: varchar({ length: 255 }).notNull(),
  marca: varchar({ length: 100 }),
  modelo: varchar({ length: 100 }),
  numeroSerie: varchar("numero_serie", { length: 100 }),
  quantidade: integer().default(1).notNull(),
  fotoUrl: text("foto_url").notNull(),                   // obrigatória — sem foto não cadastra
  condicao: varchar({ length: 20 }).default('boa').notNull(),
  observacao: text(),
  itemEntradaId: integer("item_entrada_id"),             // p/ saída parcial: aponta p/ item original
  statusItem: varchar("status_item", { length: 20 }).default('na_obra').notNull(),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

// ============================================================
// FCSign — Assinatura digital interna (Rev. 2104)
// MP 2200-2: assinatura eletronica simples com evidencia
// ============================================================
export const signatureSessions = pgTable("signature_sessions", {
  id: serial().primaryKey().notNull(),
  companyId: integer("company_id").notNull(),
  employeeId: integer("employee_id").notNull(),
  tipo: varchar({ length: 50 }).notNull(),                 // 'contrato_experiencia' | 'comunicado' | 'epi' | 'outros'
  documentTitle: varchar("document_title", { length: 255 }).notNull(),
  documentHtml: text("document_html").notNull(),           // HTML do documento (snapshot imutavel)
  documentHash: varchar("document_hash", { length: 64 }).notNull(), // SHA-256 hex do HTML
  finalDocumentUrl: text("final_document_url"),            // URL do HTML final assinado (storage)
  finalEmployeeDocumentId: integer("final_employee_document_id"), // FK p/ employeeDocuments quando completo
  status: varchar({ length: 20 }).default('pendente').notNull(), // pendente | em_andamento | completo | cancelado
  createdByUserId: integer("created_by_user_id").notNull(),
  createdByName: varchar("created_by_name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { mode: 'string' }),
  cancelledAt: timestamp("cancelled_at", { mode: 'string' }),
  observacoes: text(),
});

export const signatureSigners = pgTable("signature_signers", {
  id: serial().primaryKey().notNull(),
  sessionId: integer("session_id").notNull(),
  role: varchar({ length: 20 }).notNull(),                 // 'empregado' | 'empregador' | 'testemunha_1' | 'testemunha_2'
  ordem: integer().default(1).notNull(),
  nome: varchar({ length: 255 }).notNull(),
  cpf: varchar({ length: 20 }),
  email: varchar({ length: 255 }),
  token: varchar({ length: 64 }).notNull(),                // hex 32 bytes (64 chars)
  signedAt: timestamp("signed_at", { mode: 'string' }),
  signatureDataUrl: text("signature_data_url"),            // PNG base64 do canvas
  signatureHash: varchar("signature_hash", { length: 64 }),// SHA-256 do dataUrl
  ip: varchar({ length: 45 }),
  userAgent: text("user_agent"),
  geoCidade: varchar("geo_cidade", { length: 100 }),
  geoEstado: varchar("geo_estado", { length: 50 }),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("signature_signers_token_unique").on(table.token),
]);

// Rev. 2125 — Counters atômicos por (company, ano, tipo) pra numeração
// sequencial de contratos institucionais (Contrato de Experiência, etc).
// Padrão idêntico ao `compras_sc_counters` (Rev. 1799/1790).
export const contractCounters = pgTable("contract_counters", {
  companyId: integer("company_id").notNull(),
  ano: integer().notNull(),
  tipo: varchar({ length: 50 }).notNull(),                 // 'contrato_experiencia' | ...
  ultimoSeq: integer("ultimo_seq").default(0).notNull(),
  atualizadoEm: timestamp("atualizado_em", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_contract_counters_company_ano_tipo").on(table.companyId, table.ano, table.tipo),
]);

// ── Rev. 2141 — Templates institucionais FC com versionamento completo ──────
// `system_document_templates`: 1 linha por tipo (contrato_experiencia,
// termo_responsabilidade, comunicado, advertencia, aviso_previo,
// termo_rescisao, carta_mdo). Conteúdo HTML editável via WYSIWYG na aba
// Configurações > Templates de Documentos.
// `system_document_template_versions`: histórico completo (Rev. 1, 2, ...)
// com autor/data/comentário — toda edição cria uma nova linha aqui.
export const systemDocumentTemplates = pgTable("system_document_templates", {
  id: serial().notNull(),
  tipo: varchar({ length: 60 }).notNull(),                  // único
  titulo: varchar({ length: 200 }).notNull(),
  descricao: text(),
  conteudoHtml: text("conteudo_html").notNull(),
  versaoAtual: integer("versao_atual").default(1).notNull(),
  ativo: smallint().default(1).notNull(),
  atualizadoPorId: integer("atualizado_por_id"),
  atualizadoPorNome: varchar("atualizado_por_nome", { length: 255 }),
  // Rev. 2747 — nomes explícitos snake_case: a tabela no Neon foi criada (Rev. 2141)
  // com created_at/updated_at; sem o nome explícito o Drizzle emitia "createdAt" e
  // o db.select() quebrava com `column "createdAt" does not exist`.
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
  // ── Rev. 2747 — Controle ISO documental (aditivo; self-heal ADD COLUMN) ──
  // Códigos/estados/aprovação seguem a lógica de norma ISO 9001 (controle de
  // documentos). snake_case explícito p/ casar com o que o [SyncSchema] cria.
  codigo: varchar("codigo", { length: 40 }),                       // ex: FC-RH-001
  status: varchar("status", { length: 20 }).default("rascunho").notNull(), // rascunho|vigente|obsoleto
  elaboradoPorId: integer("elaborado_por_id"),
  elaboradoPorNome: varchar("elaborado_por_nome", { length: 255 }),
  aprovadoPorId: integer("aprovado_por_id"),
  aprovadoPorNome: varchar("aprovado_por_nome", { length: 255 }),
  aprovadoEm: timestamp("aprovado_em", { mode: 'string' }),
  dataVigencia: varchar("data_vigencia", { length: 20 }),          // ISO yyyy-mm-dd
  proximaRevisao: varchar("proxima_revisao", { length: 20 }),      // ISO yyyy-mm-dd
  // Rev. 2754 — soft-delete (exclusão pelo admin). NULL = ativo; com data = excluído
  // (some das listas/consumo). NUNCA fazemos DELETE físico (R-001/R-007/R-010).
  deletedAt: timestamp("deleted_at", { mode: 'string' }),
}, (table) => [
  uniqueIndex("uq_sys_doc_tpl_tipo").on(table.tipo),
]);

export const systemDocumentTemplateVersions = pgTable("system_document_template_versions", {
  id: serial().notNull(),
  templateId: integer("template_id").notNull(),
  versao: integer().notNull(),
  conteudoHtml: text("conteudo_html").notNull(),
  comentario: text(),                                       // descrição do que mudou
  criadoPorId: integer("criado_por_id"),
  criadoPorNome: varchar("criado_por_nome", { length: 255 }),
  // Rev. 2747 — nome explícito snake_case (mesmo motivo do template pai).
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_sys_doc_tpl_ver_tpl_versao").on(table.templateId, table.versao),
  index("idx_sys_doc_tpl_ver_tpl").on(table.templateId),
]);

// ============================================================================
// MÓDULO: CONTROLE DE EQUIPAMENTOS (Rev. 2256+) — Fase 1 Sprint 1
// ============================================================================
// Resolve perda recorrente de R$ 10-20k/mês com locações descontroladas.
// - Rastreio físico unitário (1 registro por unidade), foto obrigatória,
//   alerta de vencimento, conferência de fatura mensal.
// - Análise CAPEX (VPL/Payback/CEA/TCO) na entrada (Solicitação de Equipamento).
// - Plug no Raio-X do funcionário (aba "Empréstimos" já existe).
//
// Convenção: TODOS os novos campos são nullable ou têm default — não quebram
// código existente. Migrações são ADD COLUMN / CREATE TABLE puras.

// 1) Equipamentos PRÓPRIOS (ativo fixo da construtora)
export const equipamentosProprios = pgTable("equipamentos_proprios", {
  id:                      serial().primaryKey(),
  companyId:               integer("company_id").notNull(),
  codigoPatrimonio:        varchar("codigo_patrimonio", { length: 50 }).notNull(),
  descricao:               varchar({ length: 255 }).notNull(),
  categoria:               varchar({ length: 100 }),
  numeroSerie:             varchar("numero_serie", { length: 100 }),
  marca:                   varchar({ length: 100 }),
  modelo:                  varchar({ length: 100 }),
  dataAquisicao:           varchar("data_aquisicao", { length: 10 }),
  valorAquisicao:          numeric("valor_aquisicao", { precision: 14, scale: 2 }),
  vidaUtilMeses:           integer("vida_util_meses"),
  custoManutencaoMedioMes: numeric("custo_manut_medio_mes", { precision: 14, scale: 2 }).default("0"),
  custoSeguroMedioMes:     numeric("custo_seguro_medio_mes", { precision: 14, scale: 2 }).default("0"),
  // Localização: "almoxarifado" ou "obra" (com obraId)
  localizacaoAtualTipo:    varchar("localizacao_atual_tipo", { length: 20 }).default("almoxarifado"),
  localizacaoAtualObraId:  integer("localizacao_atual_obra_id"),
  // Status: disponivel | em_obra | manutencao | baixado
  status:                  varchar({ length: 20 }).notNull().default("disponivel"),
  fotosJson:               jsonb("fotos_json"),
  observacoes:             text(),
  ativo:                   boolean().default(true),
  // Rev. 2514 — rastreabilidade: quem cadastrou (snapshot do nome p/ não
  // depender de JOIN em users; user_id mantém o link forte).
  criadoPorUserId:         integer("criado_por_user_id"),
  criadoPorNome:           varchar("criado_por_nome", { length: 255 }),
  createdAt:               timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt:               timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_equip_proprio_company_patrimonio").on(table.companyId, table.codigoPatrimonio),
  index("idx_equip_proprio_company_status").on(table.companyId, table.status),
  index("idx_equip_proprio_categoria").on(table.categoria),
]);

// 2) Equipamentos LOCADOS (1 registro por unidade física locada)
export const equipamentosLocados = pgTable("equipamentos_locados", {
  id:                          serial().primaryKey(),
  companyId:                   integer("company_id").notNull(),
  obraId:                      integer("obra_id"),
  fornecedorId:                integer("fornecedor_id"),
  fornecedorNome:              varchar("fornecedor_nome", { length: 255 }),
  ordemCompraId:               integer("ordem_compra_id"),    // FK lógica → compras_ordens
  contratoLocacaoId:           integer("contrato_locacao_id"),// FK lógica → terceiro_contratos
  codigoPatrimonioFornecedor:  varchar("codigo_patrimonio_fornecedor", { length: 100 }),
  codigoInternoErp:            varchar("codigo_interno_erp", { length: 50 }),
  descricao:                   varchar({ length: 255 }).notNull(),
  categoria:                   varchar({ length: 100 }),
  numeroSerie:                 varchar("numero_serie", { length: 100 }),
  dataInicio:                  varchar("data_inicio", { length: 10 }).notNull(),
  dataFimPrevista:             varchar("data_fim_prevista", { length: 10 }).notNull(),
  dataFimReal:                 varchar("data_fim_real", { length: 10 }),
  valorDiario:                 numeric("valor_diario", { precision: 14, scale: 2 }),
  valorMensal:                 numeric("valor_mensal", { precision: 14, scale: 2 }),
  // Status: em_uso | devolvido | atrasado | em_renovacao | localizacao_pendente | em_manutencao
  status:                      varchar({ length: 30 }).notNull().default("em_uso"),
  fotosRecebimentoJson:        jsonb("fotos_recebimento_json"),
  fotosDevolucaoJson:          jsonb("fotos_devolucao_json"),
  // Rev. 2340 — URL de foto buscada por IA (Google Custom Search Image).
  // Fallback visual quando NÃO há fotos do recebimento (fotosRecebimentoJson vazio).
  fotoUrl:                     text("foto_url"),
  funcionarioResponsavelId:    integer("funcionario_responsavel_id"),
  funcionarioResponsavelNome:  varchar("funcionario_responsavel_nome", { length: 255 }),
  observacoes:                 text(),
  // Cadeia de renovações: aponta para a unidade locada anterior (caso seja renovação)
  ocAnteriorId:                integer("oc_anterior_id"),
  // Último check-in semanal (controle de "ainda está na obra")
  ultimoCheckInData:           varchar("ultimo_check_in_data", { length: 10 }),
  ultimoCheckInUserId:         integer("ultimo_check_in_user_id"),
  // Rev. 2308 — Importação em lote via PDF da locadora (Jalves etc).
  numeroContratoFornecedor:    varchar("numero_contrato_fornecedor", { length: 50 }),
  atendenteResponsavel:        varchar("atendente_responsavel", { length: 255 }),
  arquivoOrigemUrl:            text("arquivo_origem_url"),
  valorSubtotalContrato:       numeric("valor_subtotal_contrato", { precision: 14, scale: 2 }),
  createdAt:                   timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt:                   timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
}, (table) => [
  index("idx_equip_loc_company_status").on(table.companyId, table.status),
  index("idx_equip_loc_obra").on(table.obraId),
  index("idx_equip_loc_fornecedor").on(table.fornecedorId),
  index("idx_equip_loc_data_fim").on(table.dataFimPrevista),
  index("idx_equip_loc_oc").on(table.ordemCompraId),
  index("idx_equip_loc_num_contrato").on(table.companyId, table.numeroContratoFornecedor),
]);

// 2.1) Rev. 2355 — Biblioteca CURADA de fotos por descrição
// canônica. O user sobe 1 foto por descrição normalizada (ex.:
// "PAINEL NR18 1,5X1,0 COM DEGRAU") e o ERP propaga essa foto
// pra TODAS as unidades cadastradas (atuais e futuras) com a
// mesma descrição normalizada. Substitui a "busca de fotos com
// IA" (revs 2340-2350) que tinha taxa de acerto baixa por
// limitação dos provedores (Google CSE bloqueado, OV/WM só EN).
export const equipamentosFotosCanonicas = pgTable("equipamentos_fotos_canonicas", {
  id:                    serial().primaryKey(),
  companyId:             integer("company_id").notNull(),
  // Descrição NORMALIZADA: NFD + remove diacríticos + uppercase
  // + collapse espaços + trim. Chave de match.
  descricaoNormalizada:  varchar("descricao_normalizada", { length: 255 }).notNull(),
  // Descrição original (pra exibir no modal "Biblioteca de fotos").
  descricaoOriginal:     varchar("descricao_original", { length: 255 }).notNull(),
  fotoUrl:               text("foto_url").notNull(),
  criadoPor:             integer("criado_por"),
  createdAt:             timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt:             timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
}, (table) => [
  index("idx_fotos_canon_company").on(table.companyId),
  uniqueIndex("uniq_fotos_canon_company_desc").on(table.companyId, table.descricaoNormalizada),
]);

// 3) Auditoria de eventos do equipamento locado (timeline)
export const equipamentoLocadoEventos = pgTable("equipamento_locado_eventos", {
  id:                   serial().primaryKey(),
  companyId:            integer("company_id").notNull(),
  equipamentoLocadoId:  integer("equipamento_locado_id").notNull(),
  // Tipo: RECEBIMENTO | SAIDA_ALMOX | RETORNO_ALMOX | DEVOLUCAO_FORNECEDOR
  //     | RENOVACAO | MANUTENCAO | CHECK_IN_OBRA | LOCALIZACAO_PENDENTE
  //     | TRANSFERENCIA_OBRA
  tipo:                 varchar({ length: 40 }).notNull(),
  dataEvento:           timestamp("data_evento", { mode: "string" }).defaultNow().notNull(),
  funcionarioId:        integer("funcionario_id"),
  funcionarioNome:      varchar("funcionario_nome", { length: 255 }),
  obraId:               integer("obra_id"),
  obraNome:             varchar("obra_nome", { length: 255 }),
  fotosJson:            jsonb("fotos_json"),
  observacao:           text(),
  usuarioId:            integer("usuario_id"),
  usuarioNome:          varchar("usuario_nome", { length: 255 }),
  // Rev. 2453 — Assinaturas inline (PNG base64) + URL do comprovante PDF.
  // Usadas pelo evento DEVOLUCAO_FORNECEDOR para gerar o comprovante
  // compartilhável via WhatsApp pela locadora.
  assinaturaEntregadorNome: varchar("assinatura_entregador_nome", { length: 255 }),
  assinaturaEntregadorUrl:  text("assinatura_entregador_url"),  // dataURL PNG
  assinaturaRecebedorNome:  varchar("assinatura_recebedor_nome", { length: 255 }),
  assinaturaRecebedorUrl:   text("assinatura_recebedor_url"),   // dataURL PNG
  pdfComprovanteToken:      varchar("pdf_comprovante_token", { length: 64 }),
  createdAt:            timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (table) => [
  index("idx_equip_evt_equip").on(table.equipamentoLocadoId),
  index("idx_equip_evt_tipo_data").on(table.tipo, table.dataEvento),
  index("idx_equip_evt_company").on(table.companyId),
]);

// 4) [REMOVIDO Rev. 2279] solicitacoes_equipamento — fluxo SE consolidado dentro
//    de compras_solicitacoes (tipo="equipamento"). Tabela nunca foi migrada para
//    o banco (verificado em prod via information_schema). Pedido user (VITRA):
//    "nao quero uma aba separada para locação de equipamentos, quero isso dentro
//    da solicitação de compras". Removida do schema + router + sidebar + páginas.
//    R-001/R-007/R-010: como a tabela nunca existiu fisicamente, nenhum DROP foi
//    executado — apenas remoção da declaração Drizzle.

// 5) Conferência de Fatura de Locação (cruza fatura do fornecedor × dias reais)
export const faturaLocacaoConferencia = pgTable("fatura_locacao_conferencia", {
  id:                  serial().primaryKey(),
  companyId:           integer("company_id").notNull(),
  fornecedorId:        integer("fornecedor_id"),
  fornecedorNome:      varchar("fornecedor_nome", { length: 255 }),
  mesReferencia:       varchar("mes_referencia", { length: 7 }).notNull(),  // YYYY-MM
  numeroFatura:        varchar("numero_fatura", { length: 100 }),
  valorFaturado:       numeric("valor_faturado", { precision: 14, scale: 2 }),
  valorCalculadoErp:   numeric("valor_calculado_erp", { precision: 14, scale: 2 }),
  arquivoFaturaUrl:    text("arquivo_fatura_url"),
  arquivoFaturaTipo:   varchar("arquivo_fatura_tipo", { length: 10 }),  // pdf | xml | xlsx
  ocrExtractedJson:    jsonb("ocr_extracted_json"),
  divergenciasJson:    jsonb("divergencias_json"),
  // Status: pendente | conferida | aprovada | contestada | paga
  status:              varchar({ length: 30 }).notNull().default("pendente"),
  observacoes:         text(),
  conferidoPorId:      integer("conferido_por_id"),
  conferidoPorNome:    varchar("conferido_por_nome", { length: 255 }),
  conferidoEm:         timestamp("conferido_em", { mode: "string" }),
  createdAt:           timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt:           timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_fatura_company_fornecedor_mes").on(
    table.companyId, table.fornecedorId, table.mesReferencia
  ),
  index("idx_fatura_status").on(table.companyId, table.status),
]);

// 6) Parâmetros CAPEX (editáveis pelo financeiro; semeados na 1ª execução)
export const parametrosCapex = pgTable("parametros_capex", {
  id:                serial().primaryKey(),
  companyId:         integer("company_id").notNull(),
  // Chaves padrão: tma_mensal | limite_alcada_capex | taxa_manutencao_anual
  //   | taxa_seguro_anual | peso_utilizacao_historica | limiar_payback_fracao
  //   | vida_util_categoria_<slug>
  chave:             varchar({ length: 80 }).notNull(),
  valorNumerico:     numeric("valor_numerico", { precision: 14, scale: 4 }),
  valorTexto:        varchar("valor_texto", { length: 255 }),
  descricao:         text(),
  // Categoria: financeiro | tecnico | alcada | vida_util
  categoria:         varchar({ length: 60 }),
  editavel:          boolean().default(true),
  atualizadoPorId:   integer("atualizado_por_id"),
  atualizadoPorNome: varchar("atualizado_por_nome", { length: 255 }),
  createdAt:         timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt:         timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_param_capex_company_chave").on(table.companyId, table.chave),
]);

// Rev. 2388 — Controle rígido de auditoria no Almoxarifado.
// Toda exclusão (item/unidade) e toda alteração manual de quantidade no
// almoxarifado gera 1 linha aqui. Senha (se user local) + justificativa
// obrigatória. Admin da empresa valida/rejeita.
export const almoxarifadoAuditoria = pgTable("almoxarifado_auditoria", {
  id:                serial().primaryKey(),
  companyId:         integer("company_id").notNull(),
  obraId:            integer("obra_id"),
  userId:            integer("user_id").notNull(),
  userNome:          varchar("user_nome", { length: 255 }),
  // 'excluir_item' | 'excluir_unidade' | 'alterar_quantidade'
  acao:              varchar({ length: 40 }).notNull(),
  entidadeTipo:      varchar("entidade_tipo", { length: 40 }).notNull(),
  entidadeId:        integer("entidade_id").notNull(),
  entidadeNome:      varchar("entidade_nome", { length: 255 }),
  dadosAntes:        jsonb("dados_antes"),
  dadosDepois:       jsonb("dados_depois"),
  justificativa:     text().notNull(),
  ip:                varchar({ length: 64 }),
  // 'pendente' | 'validado' | 'rejeitado'
  statusValidacao:   varchar("status_validacao", { length: 20 }).notNull().default("pendente"),
  validadoPorId:     integer("validado_por_id"),
  validadoPorNome:   varchar("validado_por_nome", { length: 255 }),
  validadoEm:        timestamp("validado_em", { mode: "string" }),
  observacaoValidacao: text("observacao_validacao"),
  createdAt:         timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (table) => [
  index("idx_alm_aud_company_status").on(table.companyId, table.statusValidacao),
  index("idx_alm_aud_obra").on(table.obraId),
]);

// Rev. 2429 — Aprovadores delegados de Auditoria do Almoxarifado por obra.
// Antes: só admin/admin_master validava auditorias (hardcoded).
// Agora: cada obra tem N aprovadores (1 principal + N delegados) que também
// podem validar/rejeitar. admin_master continua podendo tudo como rede de
// proteção. Auditorias SEM obraId (excluir_unidade, etc.) seguem só admin.
// Convenção: userId aponta pra `users` (quem loga), não pra `employees`.
export const obraResponsaveisEstoque = pgTable("obra_responsaveis_estoque", {
  id:           serial().primaryKey(),
  companyId:    integer("company_id").notNull(),
  obraId:       integer("obra_id").notNull(),
  userId:       integer("user_id").notNull(),
  userNome:     varchar("user_nome", { length: 255 }),
  // 'principal' | 'delegado'
  tipo:         varchar({ length: 20 }).notNull().default("delegado"),
  criadoPorId:  integer("criado_por_id"),
  criadoPorNome: varchar("criado_por_nome", { length: 255 }),
  createdAt:    timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (table) => [
  index("idx_resp_estoque_obra").on(table.obraId),
  index("idx_resp_estoque_user").on(table.userId),
]);

// Rev. 2850 — Persistência da Análise Inteligente (IA) do DRE.
// A análise (cara, chamada ao modelo) passa a ficar SALVA por
// company + período + tipo de período, junto com uma NOTA de 0 a 100.
// Fica disponível até o usuário mandar PROCESSAR NOVAMENTE (upsert).
export const dreAnalisesIa = pgTable("dre_analises_ia", {
  id:            serial().primaryKey(),
  companyId:     integer("company_id").notNull(),
  periodo:       varchar({ length: 20 }).notNull(),
  tipoPeriodo:   varchar("tipo_periodo", { length: 20 }).notNull().default("mensal"),
  nota:          integer().default(0),
  payload:       jsonb().notNull(),
  geradoEm:      timestamp("gerado_em", { mode: "string" }).defaultNow().notNull(),
  geradoPorId:   integer("gerado_por_id"),
  geradoPorNome: varchar("gerado_por_nome", { length: 255 }),
}, (table) => [
  uniqueIndex("uniq_dre_analise_chave").on(table.companyId, table.periodo, table.tipoPeriodo),
]);

// Rev. 3543 — Notas Fiscais de Serviço Eletrônicas (NFS-e) emitidas pela FC Engenharia.
// Controle de NFs emitidas: cruzamento com lançamentos financeiros e linhas do extrato bancário.
// Tabela criada via self-heal CREATE TABLE IF NOT EXISTS (R-001/R-007/R-010 OK).
export const fiscalNotes = pgTable("fiscal_notes", {
  id:                  serial().primaryKey(),
  companyId:           integer("company_id").notNull(),
  numeroNf:            varchar("numero_nf", { length: 20 }).notNull(),
  serie:               varchar("serie", { length: 20 }),
  chaveAcesso:         varchar("chave_acesso", { length: 60 }),
  dataEmissao:         date("data_emissao", { mode: "string" }).notNull(),
  dataCompetencia:     date("data_competencia", { mode: "string" }),
  dataVencimento:      date("data_vencimento", { mode: "string" }),
  tomadorCnpj:         varchar("tomador_cnpj", { length: 20 }),
  tomadorRazaoSocial:  varchar("tomador_razao_social", { length: 255 }),
  obraId:              integer("obra_id"),
  obraNome:            varchar("obra_nome", { length: 255 }),
  bmReferencia:        varchar("bm_referencia", { length: 60 }),
  descricaoServico:    text("descricao_servico"),
  valorBruto:          numeric("valor_bruto", { precision: 15, scale: 2 }).notNull(),
  deducoesTotal:       numeric("deducoes_total", { precision: 15, scale: 2 }).default("0"),
  baseCalculoIss:      numeric("base_calculo_iss", { precision: 15, scale: 2 }),
  aliquotaIss:         numeric("aliquota_iss", { precision: 5, scale: 2 }),
  issRetido:           numeric("iss_retido", { precision: 15, scale: 2 }).default("0"),
  retencaoInss:        numeric("retencao_inss", { precision: 15, scale: 2 }).default("0"),
  retencaoIrrf:        numeric("retencao_irrf", { precision: 15, scale: 2 }).default("0"),
  retencaoPisCofins:   numeric("retencao_pis_cofins", { precision: 15, scale: 2 }).default("0"),
  retencaoCsll:        numeric("retencao_csll", { precision: 15, scale: 2 }).default("0"),
  retencaoPis:         numeric("retencao_pis", { precision: 15, scale: 2 }).default("0"),
  retencaoCofins:      numeric("retencao_cofins", { precision: 15, scale: 2 }).default("0"),
  retencaoOutras:      numeric("retencao_outras", { precision: 15, scale: 2 }).default("0"),
  valorLiquido:        numeric("valor_liquido", { precision: 15, scale: 2 }).notNull(),
  dataPrestacao:       date("data_prestacao", { mode: "string" }),
  cdCnae:              varchar("cd_cnae", { length: 20 }),
  cdListaServico:      varchar("cd_lista_servico", { length: 10 }),
  optanteSimples:      boolean("optante_simples"),
  tributada:           boolean("tributada"),
  tomadorInscricao:    varchar("tomador_inscricao", { length: 30 }),
  tomadorEmail:        varchar("tomador_email", { length: 255 }),
  tomadorTelefone:     varchar("tomador_telefone", { length: 30 }),
  status:              varchar("status", { length: 30 }).default("pendente").notNull(),
  entryId:             integer("entry_id"),
  stmtLineId:          integer("stmt_line_id"),
  arquivoUrl:          text("arquivo_url"),
  arquivoNome:         varchar("arquivo_nome", { length: 255 }),
  observacoes:         text("observacoes"),
  criadoPorId:         integer("criado_por_id"),
  criadoPorNome:       varchar("criado_por_nome", { length: 255 }),
  createdAt:           timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt:           timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  // Rev. 3550 — colunas SEFAZ adicionadas via SyncSchema+ (precisam estar aqui para o Drizzle ORM não gerar SQL inválido)
  origem:              varchar("origem", { length: 30 }).default("manual"),
  emitenteCnpj:        varchar("emitente_cnpj", { length: 20 }),
  emitenteNome:        varchar("emitente_nome", { length: 255 }),
  nsuSefaz:            varchar("nsu_sefaz", { length: 20 }),
  xmlPayload:          text("xml_payload"),
}, (t) => [
  index("idx_fn_company").on(t.companyId),
  index("idx_fn_emissao").on(t.dataEmissao),
  index("idx_fn_status").on(t.status),
]);

// Rev. 2960 — "Combo de Demissões" SALVO (simulação persistente). O Combo do
// Dashboard Aviso Prévio era volátil; agora pode ser salvo por NOME, listado,
// reaberto, editado (tipo de aviso + data de referência + adicionar/remover
// funcionários) e excluído (soft-delete). Tabela criada via self-heal
// CREATE TABLE IF NOT EXISTS (R-001/R-007/R-010 — sem ALTER/DROP/DELETE em prod).
export const comboDemissaoSimulacoes = pgTable("combo_demissao_simulacoes", {
  id:             serial().primaryKey(),
  companyId:      integer("company_id").notNull(),
  companyIds:     text("company_ids"), // JSON array (modo CONSTRUTORAS multi-empresa)
  nome:           varchar({ length: 255 }).notNull(),
  tipo:           varchar({ length: 40 }).notNull().default("empregador_trabalhado"),
  dataReferencia: varchar("data_referencia", { length: 10 }).notNull(),
  employeeIds:    text("employee_ids").notNull(), // JSON array de IDs de funcionários
  snapshotJson:   text("snapshot_json"), // totais/observações no momento do salvamento (opcional)
  criadoPorId:    integer("criado_por_id"),
  criadoPorNome:  varchar("criado_por_nome", { length: 255 }),
  createdAt:      timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt:      timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  deletedAt:      timestamp("deleted_at", { mode: "string" }),
}, (table) => [
  index("idx_combo_demissao_company").on(table.companyId),
]);

// Rev. 3877 — Templates de extrato bancário por empresa.
// Cada template define palavras-chave de identificação automática, prefixos
// de linha a ignorar e instruções extras para a IA de parsing de PDF.
// Criado via self-heal (CREATE TABLE IF NOT EXISTS) — sem ALTER/DROP/DELETE.
export const bankStatementTemplates = pgTable("bank_statement_templates", {
  id:            serial("id").primaryKey(),
  companyId:     integer("company_id").notNull(),
  bancoNome:     varchar("banco_nome", { length: 100 }).notNull(),
  palavrasChave: text("palavras_chave").notNull().default("[]"),  // JSON string[]
  skipPrefixes:  text("skip_prefixes").notNull().default("[]"),   // JSON string[]
  instrucoesIa:  text("instrucoes_ia"),
  ativo:         smallint("ativo").notNull().default(1),
  // Rev. 3879 — Controle de revisão ISO 9001: auto-incrementado a cada UPDATE.
  revisao:       integer("revisao").notNull().default(1),
  notasRevisao:  text("notas_revisao"),
  criadoEm:      timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
  atualizadoEm:  timestamp("atualizado_em", { mode: "string" }).defaultNow().notNull(),
  criadoPorId:        integer("criado_por_id"),
  criadoPorNome:      varchar("criado_por_nome", { length: 255 }),
  // Rev. 3885 — Rastreabilidade de quem atualizou por último.
  atualizadoPorId:    integer("atualizado_por_id"),
  atualizadoPorNome:  varchar("atualizado_por_nome", { length: 255 }),
}, (table) => [
  index("idx_bank_stmt_tmpl_company").on(table.companyId),
]);

// ─────────────────────────────────────────────────────────────────────────────
// Rev. 3900 — PT — Permissão de Trabalho (NR-35 / trabalho em altura)
// Workflow digital: rascunho → em_andamento → liberada → concluida.
// Assinaturas dos envolvidos via canvas pad (pt_assinaturas) +
// liberação formal via FCSign (tipo "pt_altura").
// ─────────────────────────────────────────────────────────────────────────────

export const ptPermissoes = pgTable("pt_permissoes", {
  id:                       serial("id").primaryKey(),
  companyId:                integer("company_id").notNull(),
  obraId:                   integer("obra_id"),
  employeeId:               integer("employee_id").notNull(),

  numero:                   varchar("numero", { length: 30 }).notNull(),
  status:                   varchar("status", { length: 20 }).notNull().default("rascunho"),
  // rascunho | em_andamento | liberada | concluida | cancelada

  dataEmissao:              varchar("data_emissao", { length: 10 }),
  horaInicio:               varchar("hora_inicio", { length: 5 }),
  horaTermino:              varchar("hora_termino", { length: 5 }),
  maoDeObra:                varchar("mao_de_obra", { length: 20 }),
  supervisorNome:           varchar("supervisor_nome", { length: 255 }),
  empresaExecutanteCnpj:    varchar("empresa_executante_cnpj", { length: 20 }),
  empresaExecutanteNome:    varchar("empresa_executante_nome", { length: 255 }),
  outrosFormularios:        smallint("outros_formularios").default(0),
  outrosFormulariosDesc:    text("outros_formularios_desc"),
  outrosFormulariosAnexoUrl: text("outros_formularios_anexo_url"),

  tiposTrabalhoJson:        text("tipos_trabalho_json"),
  descricaoTrabalho:        text("descricao_trabalho"),

  checklistJson:            text("checklist_json"),

  envolvidosJson:           text("envolvidos_json"),

  empresaSetorExecutante:   varchar("empresa_setor_executante", { length: 255 }),
  responsavelAreaNome:      varchar("responsavel_area_nome", { length: 255 }),
  responsavelAreaAss:       text("responsavel_area_ass"),
  responsavelLiberacaoNome: varchar("responsavel_liberacao_nome", { length: 255 }),
  responsavelLiberacaoAss:  text("responsavel_liberacao_ass"),
  executanteNome:           varchar("executante_nome", { length: 255 }),
  executanteAss:            text("executante_ass"),

  conclusaoSolicitanteNome: varchar("conclusao_solicitante_nome", { length: 255 }),
  conclusaoData:            varchar("conclusao_data", { length: 10 }),
  conclusaoHoraInicio:      varchar("conclusao_hora_inicio", { length: 5 }),
  conclusaoHoraFim:         varchar("conclusao_hora_fim", { length: 5 }),

  revalidacaoNome:          varchar("revalidacao_nome", { length: 255 }),
  revalidacaoData:          varchar("revalidacao_data", { length: 10 }),
  revalidacaoHoraInicio:    varchar("revalidacao_hora_inicio", { length: 5 }),
  revalidacaoHoraFim:       varchar("revalidacao_hora_fim", { length: 5 }),
  revalidacaoResponsavel:   varchar("revalidacao_responsavel", { length: 255 }),

  fcSignSessionId:          integer("fc_sign_session_id"),

  criadoPorId:              integer("criado_por_id"),
  criadoPorNome:            varchar("criado_por_nome", { length: 255 }),
  createdAt:                timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt:                timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  deletedAt:                timestamp("deleted_at", { mode: "string" }),
}, (table) => [
  index("idx_pt_company").on(table.companyId),
  index("idx_pt_employee").on(table.employeeId),
  index("idx_pt_obra").on(table.obraId),
  index("idx_pt_status").on(table.companyId, table.status),
  index("idx_pt_numero").on(table.companyId, table.numero),
]);

export const ptAssinaturas = pgTable("pt_assinaturas", {
  id:             serial("id").primaryKey(),
  ptId:           integer("pt_id").notNull(),
  companyId:      integer("company_id").notNull(),
  posicao:        integer("posicao").notNull(),
  nomeManual:     varchar("nome_manual", { length: 255 }),
  funcaoManual:   varchar("funcao_manual", { length: 255 }),
  employeeId:     integer("employee_id"),
  assinaturaImg:  text("assinatura_img"),
  assinadoEm:     timestamp("assinado_em", { mode: "string" }),
  ip:             varchar("ip", { length: 45 }),
  createdAt:      timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (table) => [
  index("idx_pt_assin_pt").on(table.ptId),
  index("idx_pt_assin_company").on(table.companyId),
]);

// ─────────────────────────────────────────────────────────────────────────────
// Rev. 3901 — APR — Análise Preliminar de Risco
// Matriz de risco P×G, múltiplos itens por análise, assinatura canvas.
// ─────────────────────────────────────────────────────────────────────────────

export const aprAnalises = pgTable("apr_analises", {
  id:                serial("id").primaryKey(),
  companyId:         integer("company_id").notNull(),
  obraId:            integer("obra_id"),
  employeeId:        integer("employee_id").notNull(),
  numero:            varchar("numero", { length: 30 }).notNull(),
  status:            varchar("status", { length: 20 }).notNull().default("rascunho"),
  dataEmissao:       varchar("data_emissao", { length: 10 }),
  horaInicio:        varchar("hora_inicio", { length: 5 }),
  atividade:         varchar("atividade", { length: 500 }),
  localServico:      varchar("local_servico", { length: 255 }),
  tipoAtividade:     varchar("tipo_atividade", { length: 50 }),
  checklistJson:     text("checklist_json"),
  equipeJson:             text("equipe_json"),
  assinaturasEquipeJson:  text("assinaturas_equipe_json"),
  epiJson:                text("epi_json"),
  observacoes:       text("observacoes"),
  aprovadoPorNome:   varchar("aprovado_por_nome", { length: 255 }),
  aprovadoPorAss:    text("aprovado_por_ass"),
  aprovadoEm:        timestamp("aprovado_em", { mode: "string" }),
  fcSignSessionId:   integer("fc_sign_session_id"),
  criadoPorId:       integer("criado_por_id"),
  criadoPorNome:     varchar("criado_por_nome", { length: 255 }),
  createdAt:         timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt:         timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  deletedAt:         timestamp("deleted_at", { mode: "string" }),
}, (table) => [
  index("idx_apr_company").on(table.companyId),
  index("idx_apr_obra").on(table.obraId),
  index("idx_apr_employee").on(table.employeeId),
  index("idx_apr_status").on(table.companyId, table.status),
]);

export const aprRiscos = pgTable("apr_riscos", {
  id:               serial("id").primaryKey(),
  aprId:            integer("apr_id").notNull(),
  companyId:        integer("company_id").notNull(),
  ordem:            integer("ordem").notNull().default(0),
  etapaAtividade:   varchar("etapa_atividade", { length: 500 }),
  perigo:           varchar("perigo", { length: 500 }),
  risco:            varchar("risco", { length: 500 }),
  tipoRisco:        varchar("tipo_risco", { length: 30 }),
  probabilidade:    integer("probabilidade"),
  gravidade:        integer("gravidade"),
  nivelRisco:       integer("nivel_risco"),
  medidasControle:  text("medidas_controle"),
  tipoMedida:       varchar("tipo_medida", { length: 30 }),
  responsavelNome:  varchar("responsavel_nome", { length: 255 }),
  prazo:            varchar("prazo", { length: 10 }),
  situacao:         varchar("situacao", { length: 20 }).default("aberta"),
  createdAt:        timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (table) => [
  index("idx_apr_riscos_apr").on(table.aprId),
  index("idx_apr_riscos_company").on(table.companyId),
]);

// Rev. 4096 — Cheques de terceiro recebidos de clientes, usados para pagamento de
// fornecedores via endosso. Status lifecycle: disponivel → alocado → compensado | devolvido.
// Rev. 4138 — coluna pagamento_grupo_id adicionada (rastreio de pagamentos consolidados).
export const financialChequesRecebidos = pgTable("financial_cheques_recebidos", {
  id:                    serial("id").primaryKey(),
  companyId:             integer("company_id").notNull(),
  numeroCheque:          varchar("numero_cheque", { length: 40 }).notNull(),
  emitenteNome:          varchar("emitente_nome", { length: 255 }),
  banco:                 varchar("banco", { length: 120 }),
  agencia:               varchar("agencia", { length: 20 }),
  conta:                 varchar("conta", { length: 30 }),
  valor:                 numeric("valor", { precision: 15, scale: 2 }).notNull(),
  dataEmissao:           varchar("data_emissao", { length: 10 }),
  dataBomPara:           varchar("data_bom_para", { length: 10 }),
  status:                varchar("status", { length: 20 }).notNull().default("disponivel"),
  fornecedorAlocadoId:   integer("fornecedor_alocado_id"),
  fornecedorAlocadoNome: varchar("fornecedor_alocado_nome", { length: 255 }),
  entryId:               integer("entry_id"),
  pagamentoGrupoId:      varchar("pagamento_grupo_id", { length: 36 }),
  clienteId:             integer("cliente_id"),
  clienteNome:           varchar("cliente_nome", { length: 255 }),
  observacao:            text("observacao"),
  criadoPorId:           integer("criado_por_id"),
  criadoPorNome:         varchar("criado_por_nome", { length: 255 }),
  compensadoEm:          timestamp("compensado_em", { mode: "string" }),
  criadoEm:              timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
  atualizadoEm:          timestamp("atualizado_em", { mode: "string" }).defaultNow().notNull(),
  excluidoEm:            timestamp("excluido_em", { mode: "string" }),
}, (table) => [
  index("idx_chqr_company").on(table.companyId),
  index("idx_chqr_status").on(table.companyId, table.status),
  index("idx_chqr_numero").on(table.companyId, table.numeroCheque),
]);

// ── Rev. 4182 — Scorecard do Gestor ────────────────────────────────────────
export const obraScorecardConfig = pgTable("obra_scorecard_config", {
  id:                   serial().primaryKey(),
  companyId:            integer("company_id").notNull(),
  obraId:               integer("obra_id").notNull().unique(),
  bonusTipo:            varchar("bonus_tipo", { length: 20 }).notNull().default("percentual_lucro"),
  bonusValor:           numeric("bonus_valor", { precision: 10, scale: 2 }).default("5"),
  pesoSeguranca:        integer("peso_seguranca").notNull().default(30),
  pesoPlanejamento:     integer("peso_planejamento").notNull().default(25),
  pesoCompras:          integer("peso_compras").notNull().default(20),
  pesoAlmox:            integer("peso_almox").notNull().default(15),
  pesoQualidade:        integer("peso_qualidade").notNull().default(10),
  metaSpi:              numeric("meta_spi", { precision: 4, scale: 2 }).default("0.90"),
  metaCpi:              numeric("meta_cpi", { precision: 4, scale: 2 }).default("0.90"),
  maxAcidentesGraves:   integer("max_acidentes_graves").default(0),
  maxEmergenciaisPct:   integer("max_emergenciais_pct").default(10),
  criadoEm:             timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
  atualizadoEm:         timestamp("atualizado_em", { mode: "string" }).defaultNow().notNull(),
});

export const obraRetrabalho = pgTable("obra_retrabalho", {
  id:                 serial().primaryKey(),
  companyId:          integer("company_id").notNull(),
  obraId:             integer("obra_id").notNull(),
  dataOcorrencia:     date("data_ocorrencia", { mode: "string" }).notNull(),
  servicoAfetado:     varchar("servico_afetado", { length: 500 }).notNull(),
  causaRaiz:          text("causa_raiz"),
  custoEstimado:      numeric("custo_estimado", { precision: 15, scale: 2 }),
  registradoPorId:    integer("registrado_por_id"),
  registradoPorNome:  varchar("registrado_por_nome", { length: 255 }),
  excluidoEm:         timestamp("excluido_em", { mode: "string" }),
  criadoEm:           timestamp("criado_em", { mode: "string" }).defaultNow().notNull(),
});
