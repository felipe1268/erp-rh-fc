import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, date, boolean, json } from "drizzle-orm/mysql-core";

// ============================================================
// AUTH & USERS
// ============================================================

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  username: varchar("username", { length: 100 }),
  password: varchar("password", { length: 255 }),
  mustChangePassword: boolean("mustChangePassword").default(true),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============================================================
// MULTI-TENANT: EMPRESAS
// ============================================================

export const companies = mysqlTable("companies", {
  id: int("id").autoincrement().primaryKey(),
  cnpj: varchar("cnpj", { length: 18 }).notNull().unique(),
  razaoSocial: varchar("razaoSocial", { length: 255 }).notNull(),
  nomeFantasia: varchar("nomeFantasia", { length: 255 }),
  endereco: text("endereco"),
  cidade: varchar("cidade", { length: 100 }),
  estado: varchar("estado", { length: 2 }),
  cep: varchar("cep", { length: 10 }),
  telefone: varchar("telefone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Company = typeof companies.$inferSelect;
export type InsertCompany = typeof companies.$inferInsert;

// ============================================================
// PERFIS E PERMISSÕES
// ============================================================

export const userProfiles = mysqlTable("user_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  companyId: int("companyId").notNull(),
  profileType: mysqlEnum("profileType", [
    "adm_master",
    "adm",
    "operacional",
    "avaliador",
    "consulta",
  ]).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = typeof userProfiles.$inferInsert;

export const permissions = mysqlTable("permissions", {
  id: int("id").autoincrement().primaryKey(),
  profileId: int("profileId").notNull(),
  module: varchar("module", { length: 50 }).notNull(),
  canView: boolean("canView").default(false).notNull(),
  canCreate: boolean("canCreate").default(false).notNull(),
  canEdit: boolean("canEdit").default(false).notNull(),
  canDelete: boolean("canDelete").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Permission = typeof permissions.$inferSelect;
export type InsertPermission = typeof permissions.$inferInsert;

// ============================================================
// CORE RH: COLABORADORES
// ============================================================

export const employees = mysqlTable("employees", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  matricula: varchar("matricula", { length: 20 }),

  // Dados Pessoais
  nomeCompleto: varchar("nomeCompleto", { length: 255 }).notNull(),
  cpf: varchar("cpf", { length: 14 }).notNull(),
  rg: varchar("rg", { length: 20 }),
  orgaoEmissor: varchar("orgaoEmissor", { length: 20 }),
  dataNascimento: date("dataNascimento"),
  sexo: mysqlEnum("sexo", ["M", "F", "Outro"]),
  estadoCivil: mysqlEnum("estadoCivil", ["Solteiro", "Casado", "Divorciado", "Viuvo", "Uniao_Estavel"]),
  nacionalidade: varchar("nacionalidade", { length: 50 }),
  naturalidade: varchar("naturalidade", { length: 100 }),
  nomeMae: varchar("nomeMae", { length: 255 }),
  nomePai: varchar("nomePai", { length: 255 }),

  // Documentos
  ctps: varchar("ctps", { length: 20 }),
  serieCTPS: varchar("serieCTPS", { length: 10 }),
  pis: varchar("pis", { length: 20 }),
  tituloEleitor: varchar("tituloEleitor", { length: 20 }),
  certificadoReservista: varchar("certificadoReservista", { length: 20 }),
  cnh: varchar("cnh", { length: 20 }),
  categoriaCNH: varchar("categoriaCNH", { length: 5 }),
  validadeCNH: date("validadeCNH"),

  // Endereço
  logradouro: varchar("logradouro", { length: 255 }),
  numero: varchar("numero", { length: 20 }),
  complemento: varchar("complemento", { length: 100 }),
  bairro: varchar("bairro", { length: 100 }),
  cidade: varchar("cidade", { length: 100 }),
  estado: varchar("estado", { length: 2 }),
  cep: varchar("cep", { length: 10 }),

  // Contato
  telefone: varchar("telefone", { length: 20 }),
  celular: varchar("celular", { length: 20 }),
  email: varchar("email", { length: 320 }),
  contatoEmergencia: varchar("contatoEmergencia", { length: 255 }),
  telefoneEmergencia: varchar("telefoneEmergencia", { length: 20 }),

  // Dados Profissionais
  cargo: varchar("cargo", { length: 100 }),
  funcao: varchar("funcao", { length: 100 }),
  setor: varchar("setor", { length: 100 }),
  dataAdmissao: date("dataAdmissao"),
  dataDemissao: date("dataDemissao"),
  salarioBase: varchar("salarioBase", { length: 20 }),
  valorHora: varchar("valorHora", { length: 20 }),
  horasMensais: varchar("horasMensais", { length: 10 }),
  tipoContrato: mysqlEnum("tipoContrato", ["CLT", "PJ", "Temporario", "Estagio", "Aprendiz"]),
  jornadaTrabalho: varchar("jornadaTrabalho", { length: 50 }),

  // Dados Bancários
  banco: varchar("banco", { length: 100 }),
  bancoNome: varchar("bancoNome", { length: 100 }),
  agencia: varchar("agencia", { length: 20 }),
  conta: varchar("conta", { length: 30 }),
  tipoConta: mysqlEnum("tipoConta", ["Corrente", "Poupanca"]),
  chavePix: varchar("chavePix", { length: 100 }),

  // Status
  status: mysqlEnum("status", [
    "Ativo",
    "Ferias",
    "Afastado",
    "Licenca",
    "Desligado",
    "Recluso",
    "Lista_Negra",
  ]).default("Ativo").notNull(),

  // Lista Negra
  listaNegra: boolean("listaNegra").default(false).notNull(),
  motivoListaNegra: text("motivoListaNegra"),
  dataListaNegra: date("dataListaNegra"),

  // Foto
  fotoUrl: text("fotoUrl"),

  // Observações
  observacoes: text("observacoes"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = typeof employees.$inferInsert;

// ============================================================
// HISTÓRICO FUNCIONAL
// ============================================================

export const employeeHistory = mysqlTable("employee_history", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull(),
  companyId: int("companyId").notNull(),
  tipo: mysqlEnum("tipo", [
    "Admissao",
    "Promocao",
    "Transferencia",
    "Mudanca_Funcao",
    "Mudanca_Setor",
    "Mudanca_Salario",
    "Afastamento",
    "Retorno",
    "Ferias",
    "Desligamento",
    "Outros",
  ]).notNull(),
  descricao: text("descricao"),
  valorAnterior: text("valorAnterior"),
  valorNovo: text("valorNovo"),
  dataEvento: date("dataEvento").notNull(),
  registradoPor: int("registradoPor"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EmployeeHistory = typeof employeeHistory.$inferSelect;
export type InsertEmployeeHistory = typeof employeeHistory.$inferInsert;

// ============================================================
// AUDITORIA DE SISTEMA
// ============================================================

export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  userName: varchar("userName", { length: 255 }),
  companyId: int("companyId"),
  action: varchar("action", { length: 50 }).notNull(),
  module: varchar("module", { length: 50 }).notNull(),
  entityType: varchar("entityType", { length: 50 }),
  entityId: int("entityId"),
  details: text("details"),
  ipAddress: varchar("ipAddress", { length: 45 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// ============================================================
// MÓDULO SST: ASOs
// ============================================================

export const asos = mysqlTable("asos", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  employeeId: int("employeeId").notNull(),
  tipo: mysqlEnum("tipo", ["Admissional", "Periodico", "Retorno", "Mudanca_Funcao", "Demissional"]).notNull(),
  dataExame: date("dataExame").notNull(),
  dataValidade: date("dataValidade").notNull(),
  resultado: mysqlEnum("resultado", ["Apto", "Inapto", "Apto_Restricao"]).default("Apto").notNull(),
  medico: varchar("medico", { length: 255 }),
  crm: varchar("crm", { length: 20 }),
  clinica: varchar("clinica", { length: 255 }),
  observacoes: text("observacoes"),
  documentoUrl: text("documentoUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Aso = typeof asos.$inferSelect;

// ============================================================
// MÓDULO SST: TREINAMENTOS
// ============================================================

export const trainings = mysqlTable("trainings", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  employeeId: int("employeeId").notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  norma: varchar("norma", { length: 50 }),
  cargaHoraria: varchar("cargaHoraria", { length: 20 }),
  dataRealizacao: date("dataRealizacao").notNull(),
  dataValidade: date("dataValidade"),
  instrutor: varchar("instrutor", { length: 255 }),
  entidade: varchar("entidade", { length: 255 }),
  certificadoUrl: text("certificadoUrl"),
  status: mysqlEnum("statusTreinamento", ["Valido", "Vencido", "A_Vencer"]).default("Valido").notNull(),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Training = typeof trainings.$inferSelect;

// ============================================================
// MÓDULO SST: EPIs
// ============================================================

export const epis = mysqlTable("epis", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  ca: varchar("ca", { length: 20 }),
  validadeCA: date("validadeCA"),
  fabricante: varchar("fabricante", { length: 255 }),
  quantidadeEstoque: int("quantidadeEstoque").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Epi = typeof epis.$inferSelect;

export const epiDeliveries = mysqlTable("epi_deliveries", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  epiId: int("epiId").notNull(),
  employeeId: int("employeeId").notNull(),
  quantidade: int("quantidade").default(1).notNull(),
  dataEntrega: date("dataEntrega").notNull(),
  dataDevolucao: date("dataDevolucao"),
  motivo: varchar("motivo", { length: 255 }),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EpiDelivery = typeof epiDeliveries.$inferSelect;

// ============================================================
// MÓDULO SST: ACIDENTES
// ============================================================

export const accidents = mysqlTable("accidents", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  employeeId: int("employeeId").notNull(),
  dataAcidente: date("dataAcidente").notNull(),
  horaAcidente: varchar("horaAcidente", { length: 10 }),
  tipo: mysqlEnum("tipoAcidente", ["Tipico", "Trajeto", "Doenca_Ocupacional"]).notNull(),
  gravidade: mysqlEnum("gravidade", ["Leve", "Moderado", "Grave", "Fatal"]).notNull(),
  localAcidente: varchar("localAcidente", { length: 255 }),
  descricao: text("descricao"),
  parteCorpoAtingida: varchar("parteCorpoAtingida", { length: 255 }),
  catNumero: varchar("catNumero", { length: 50 }),
  catData: date("catData"),
  diasAfastamento: int("diasAfastamento").default(0),
  testemunhas: text("testemunhas"),
  acaoCorretiva: text("acaoCorretiva"),
  documentoUrl: text("documentoUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Accident = typeof accidents.$inferSelect;

// ============================================================
// MÓDULO SST: ADVERTÊNCIAS / OSS
// ============================================================

export const warnings = mysqlTable("warnings", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  employeeId: int("employeeId").notNull(),
  tipo: mysqlEnum("tipoAdvertencia", ["Verbal", "Escrita", "Suspensao", "OSS"]).notNull(),
  dataOcorrencia: date("dataOcorrencia").notNull(),
  motivo: text("motivo").notNull(),
  descricao: text("descricao"),
  testemunhas: text("testemunhas"),
  documentoUrl: text("documentoUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Warning = typeof warnings.$inferSelect;

// ============================================================
// MÓDULO SST: RISCOS OCUPACIONAIS
// ============================================================

export const risks = mysqlTable("risks", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  setor: varchar("setor", { length: 100 }).notNull(),
  agenteRisco: varchar("agenteRisco", { length: 255 }).notNull(),
  tipoRisco: mysqlEnum("tipoRisco", ["Fisico", "Quimico", "Biologico", "Ergonomico", "Acidente"]).notNull(),
  fonteGeradora: varchar("fonteGeradora", { length: 255 }),
  grauRisco: mysqlEnum("grauRisco", ["Baixo", "Medio", "Alto", "Critico"]).notNull(),
  medidasControle: text("medidasControle"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Risk = typeof risks.$inferSelect;

// ============================================================
// MÓDULO PONTO E FOLHA
// ============================================================

export const timeRecords = mysqlTable("time_records", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  employeeId: int("employeeId").notNull(),
  data: date("data").notNull(),
  entrada1: varchar("entrada1", { length: 10 }),
  saida1: varchar("saida1", { length: 10 }),
  entrada2: varchar("entrada2", { length: 10 }),
  saida2: varchar("saida2", { length: 10 }),
  entrada3: varchar("entrada3", { length: 10 }),
  saida3: varchar("saida3", { length: 10 }),
  horasTrabalhadas: varchar("horasTrabalhadas", { length: 10 }),
  horasExtras: varchar("horasExtras", { length: 10 }),
  horasNoturnas: varchar("horasNoturnas", { length: 10 }),
  faltas: varchar("faltas", { length: 10 }),
  atrasos: varchar("atrasos", { length: 10 }),
  justificativa: text("justificativa"),
  fonte: varchar("fonte", { length: 50 }).default("manual"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TimeRecord = typeof timeRecords.$inferSelect;

export const payroll = mysqlTable("payroll", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  employeeId: int("employeeId").notNull(),
  mesReferencia: varchar("mesReferencia", { length: 7 }).notNull(),
  tipo: mysqlEnum("tipoFolha", ["Mensal", "Adiantamento", "Ferias", "Rescisao", "PLR", "13_Salario"]).notNull(),
  salarioBruto: varchar("salarioBruto", { length: 20 }),
  totalProventos: varchar("totalProventos", { length: 20 }),
  totalDescontos: varchar("totalDescontos", { length: 20 }),
  salarioLiquido: varchar("salarioLiquido", { length: 20 }),
  inss: varchar("inss", { length: 20 }),
  irrf: varchar("irrf", { length: 20 }),
  fgts: varchar("fgts", { length: 20 }),
  valeTransporte: varchar("valeTransporte", { length: 20 }),
  valeAlimentacao: varchar("valeAlimentacao", { length: 20 }),
  outrosProventos: text("outrosProventos"),
  outrosDescontos: text("outrosDescontos"),
  bancoDestino: varchar("bancoDestino", { length: 100 }),
  dataPagamento: date("dataPagamento"),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Payroll = typeof payroll.$inferSelect;

// ============================================================
// MÓDULO GESTÃO DE ATIVOS
// ============================================================

export const vehicles = mysqlTable("vehicles", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  tipo: mysqlEnum("tipoVeiculo", ["Carro", "Caminhao", "Van", "Moto", "Maquina_Pesada", "Outro"]).notNull(),
  placa: varchar("placa", { length: 10 }),
  modelo: varchar("modelo", { length: 100 }).notNull(),
  marca: varchar("marca", { length: 100 }),
  anoFabricacao: varchar("anoFabricacao", { length: 4 }),
  renavam: varchar("renavam", { length: 20 }),
  chassi: varchar("chassi", { length: 30 }),
  responsavel: varchar("responsavel", { length: 255 }),
  status: mysqlEnum("statusVeiculo", ["Ativo", "Manutencao", "Inativo"]).default("Ativo").notNull(),
  proximaManutencao: date("proximaManutencao"),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Vehicle = typeof vehicles.$inferSelect;

export const equipment = mysqlTable("equipment", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  patrimonio: varchar("patrimonio", { length: 50 }),
  tipo: varchar("tipoEquipamento", { length: 100 }),
  marca: varchar("marca", { length: 100 }),
  modelo: varchar("modelo", { length: 100 }),
  numeroSerie: varchar("numeroSerie", { length: 100 }),
  localizacao: varchar("localizacao", { length: 255 }),
  responsavel: varchar("responsavel", { length: 255 }),
  status: mysqlEnum("statusEquipamento", ["Ativo", "Manutencao", "Inativo", "Descartado"]).default("Ativo").notNull(),
  dataAquisicao: date("dataAquisicao"),
  proximaManutencao: date("proximaManutencao"),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Equipment = typeof equipment.$inferSelect;

export const extinguishers = mysqlTable("extinguishers", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  numero: varchar("numero", { length: 20 }).notNull(),
  tipo: mysqlEnum("tipoExtintor", ["PQS", "CO2", "Agua", "Espuma", "AP"]).notNull(),
  capacidade: varchar("capacidade", { length: 20 }),
  localizacao: varchar("localizacao", { length: 255 }),
  dataRecarga: date("dataRecarga"),
  validadeRecarga: date("validadeRecarga"),
  dataTesteHidrostatico: date("dataTesteHidrostatico"),
  validadeTesteHidrostatico: date("validadeTesteHidrostatico"),
  status: mysqlEnum("statusExtintor", ["OK", "Vencido", "Manutencao"]).default("OK").notNull(),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Extinguisher = typeof extinguishers.$inferSelect;

export const hydrants = mysqlTable("hydrants", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  numero: varchar("numero", { length: 20 }).notNull(),
  localizacao: varchar("localizacao", { length: 255 }),
  tipo: varchar("tipoHidrante", { length: 50 }),
  ultimaInspecao: date("ultimaInspecao"),
  proximaInspecao: date("proximaInspecao"),
  status: mysqlEnum("statusHidrante", ["OK", "Manutencao", "Inativo"]).default("OK").notNull(),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Hydrant = typeof hydrants.$inferSelect;

// ============================================================
// MÓDULO AUDITORIA E QUALIDADE
// ============================================================

export const audits = mysqlTable("audits", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  titulo: varchar("titulo", { length: 255 }).notNull(),
  tipo: mysqlEnum("tipoAuditoria", ["Interna", "Externa", "Cliente", "Certificadora"]).notNull(),
  dataAuditoria: date("dataAuditoria").notNull(),
  auditor: varchar("auditor", { length: 255 }),
  setor: varchar("setor", { length: 100 }),
  resultado: mysqlEnum("resultadoAuditoria", ["Conforme", "Nao_Conforme", "Observacao", "Pendente"]).default("Pendente").notNull(),
  descricao: text("descricao"),
  documentoUrl: text("documentoUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Audit = typeof audits.$inferSelect;

export const deviations = mysqlTable("deviations", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  auditId: int("auditId"),
  titulo: varchar("titulo", { length: 255 }).notNull(),
  tipo: mysqlEnum("tipoDesvio", ["NC_Maior", "NC_Menor", "Observacao", "Oportunidade_Melhoria"]).notNull(),
  setor: varchar("setor", { length: 100 }),
  descricao: text("descricao"),
  causaRaiz: text("causaRaiz"),
  status: mysqlEnum("statusDesvio", ["Aberto", "Em_Andamento", "Fechado", "Cancelado"]).default("Aberto").notNull(),
  responsavel: varchar("responsavel", { length: 255 }),
  prazo: date("prazo"),
  dataConclusao: date("dataConclusao"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Deviation = typeof deviations.$inferSelect;

export const actionPlans = mysqlTable("action_plans", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  deviationId: int("deviationId"),
  oQue: text("oQue").notNull(),
  porQue: text("porQue"),
  onde: varchar("onde", { length: 255 }),
  quando: date("quando"),
  quem: varchar("quem", { length: 255 }),
  como: text("como"),
  quantoCusta: varchar("quantoCusta", { length: 50 }),
  status: mysqlEnum("statusPlano", ["Pendente", "Em_Andamento", "Concluido", "Cancelado"]).default("Pendente").notNull(),
  dataConclusao: date("dataConclusao"),
  evidencia: text("evidencia"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ActionPlan = typeof actionPlans.$inferSelect;

export const chemicals = mysqlTable("chemicals", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  fabricante: varchar("fabricante", { length: 255 }),
  numeroCAS: varchar("numeroCAS", { length: 50 }),
  classificacaoPerigo: varchar("classificacaoPerigo", { length: 255 }),
  localArmazenamento: varchar("localArmazenamento", { length: 255 }),
  quantidadeEstoque: varchar("quantidadeEstoque", { length: 50 }),
  fispqUrl: text("fispqUrl"),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Chemical = typeof chemicals.$inferSelect;

export const dds = mysqlTable("dds", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  tema: varchar("tema", { length: 255 }).notNull(),
  dataRealizacao: date("dataRealizacao").notNull(),
  responsavel: varchar("responsavel", { length: 255 }),
  participantes: text("participantes"),
  descricao: text("descricao"),
  documentoUrl: text("documentoUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Dds = typeof dds.$inferSelect;

// ============================================================
// MÓDULO CIPA
// ============================================================

export const cipaElections = mysqlTable("cipa_elections", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  mandatoInicio: date("mandatoInicio").notNull(),
  mandatoFim: date("mandatoFim").notNull(),
  statusEleicao: mysqlEnum("statusEleicao", ["Planejamento", "Inscricao", "Campanha", "Votacao", "Apuracao", "Concluida"]).default("Planejamento").notNull(),
  dataEdital: date("dataEdital"),
  dataInscricaoInicio: date("dataInscricaoInicio"),
  dataInscricaoFim: date("dataInscricaoFim"),
  dataEleicao: date("dataEleicao"),
  dataPosse: date("dataPosse"),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CipaElection = typeof cipaElections.$inferSelect;

export const cipaMembers = mysqlTable("cipa_members", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  electionId: int("electionId").notNull(),
  employeeId: int("employeeId").notNull(),
  cargo: mysqlEnum("cargoCipa", ["Presidente", "Vice_Presidente", "Secretario", "Membro_Titular", "Membro_Suplente"]).notNull(),
  representacao: mysqlEnum("representacao", ["Empregador", "Empregados"]).notNull(),
  inicioEstabilidade: date("inicioEstabilidade"),
  fimEstabilidade: date("fimEstabilidade"),
  status: mysqlEnum("statusMembro", ["Ativo", "Desligado", "Substituido"]).default("Ativo").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CipaMember = typeof cipaMembers.$inferSelect;


// ============================================================
// DOCUMENTOS DE TREINAMENTO
// ============================================================

export const trainingDocuments = mysqlTable("training_documents", {
  id: int("id").autoincrement().primaryKey(),
  trainingId: int("trainingId").notNull(),
  employeeId: int("employeeId").notNull(),
  companyId: int("companyId").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 500 }).notNull(),
  fileSize: int("fileSize"),
  mimeType: varchar("mimeType", { length: 100 }),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type TrainingDocument = typeof trainingDocuments.$inferSelect;

// ============================================================
// UPLOADS DE FOLHA DE PAGAMENTO (Cartão de Ponto, Folha, Vale)
// ============================================================

export const payrollUploads = mysqlTable("payroll_uploads", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  category: mysqlEnum("category", [
    "cartao_ponto",
    "espelho_adiantamento_analitico",
    "adiantamento_sintetico",
    "adiantamento_banco_cef",
    "adiantamento_banco_santander",
    "espelho_folha_analitico",
    "folha_sintetico",
    "pagamento_banco_cef",
    "pagamento_banco_santander",
  ]).notNull(),
  month: varchar("month", { length: 7 }).notNull(), // YYYY-MM
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 500 }).notNull(),
  fileSize: int("fileSize"),
  mimeType: varchar("mimeType", { length: 100 }),
  status: mysqlEnum("uploadStatus", ["pendente", "processando", "processado", "erro"]).default("pendente").notNull(),
  recordsProcessed: int("recordsProcessed").default(0),
  errorMessage: text("errorMessage"),
  uploadedBy: int("uploadedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PayrollUpload = typeof payrollUploads.$inferSelect;

// ============================================================
// EQUIPAMENTOS DIXI (Cartão de Ponto vinculado à Obra)
// ============================================================

export const dixiDevices = mysqlTable("dixi_devices", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  serialNumber: varchar("serialNumber", { length: 50 }).notNull(), // Sn do Dixi
  obraName: varchar("obraName", { length: 255 }).notNull(),
  location: text("location"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DixiDevice = typeof dixiDevices.$inferSelect;

// ============================================================
// VALES / ADIANTAMENTOS (com aprovação)
// ============================================================

export const advances = mysqlTable("advances", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  employeeId: int("employeeId").notNull(),
  mesReferencia: varchar("mesReferencia", { length: 7 }).notNull(),
  valorAdiantamento: varchar("valorAdiantamento", { length: 20 }),
  valorLiquido: varchar("valorLiquido", { length: 20 }),
  descontoIR: varchar("descontoIR", { length: 20 }),
  bancoDestino: varchar("bancoDestino", { length: 100 }),
  diasFaltas: int("diasFaltas").default(0),
  aprovado: mysqlEnum("aprovado", ["Pendente", "Aprovado", "Reprovado"]).default("Pendente").notNull(),
  motivoReprovacao: text("motivoReprovacao"),
  dataPagamento: date("dataPagamento"),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Advance = typeof advances.$inferSelect;

// ============================================================
// PAGAMENTOS EXTRAS (diferença salário, horas extras por fora)
// ============================================================

export const extraPayments = mysqlTable("extra_payments", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  employeeId: int("employeeId").notNull(),
  mesReferencia: varchar("mesReferencia", { length: 7 }).notNull(),
  tipo: mysqlEnum("tipoExtra", ["Diferenca_Salario", "Horas_Extras", "Reembolso", "Bonus", "Outro"]).notNull(),
  descricao: text("descricao"),
  valorHoraBase: varchar("valorHoraBase", { length: 20 }),
  percentualAcrescimo: varchar("percentualAcrescimo", { length: 10 }),
  quantidadeHoras: varchar("quantidadeHoras", { length: 10 }),
  valorTotal: varchar("valorTotal", { length: 20 }).notNull(),
  bancoDestino: varchar("bancoDestino", { length: 100 }),
  dataPagamento: date("dataPagamento"),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ExtraPayment = typeof extraPayments.$inferSelect;

// ============================================================
// VR / IFOOD BENEFÍCIOS
// ============================================================

export const vrBenefits = mysqlTable("vr_benefits", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  employeeId: int("employeeId").notNull(),
  mesReferencia: varchar("mesReferencia", { length: 7 }).notNull(),
  valorDiario: varchar("valorDiario", { length: 20 }),
  diasUteis: int("diasUteis"),
  valorTotal: varchar("valorTotal", { length: 20 }).notNull(),
  operadora: varchar("operadora", { length: 100 }).default("iFood Benefícios"),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type VrBenefit = typeof vrBenefits.$inferSelect;

// ============================================================
// RESUMO MENSAL DA FOLHA (consolidado por funcionário/mês)
// ============================================================

export const monthlyPayrollSummary = mysqlTable("monthly_payroll_summary", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  employeeId: int("employeeId").notNull(),
  mesReferencia: varchar("mesReferencia", { length: 7 }).notNull(),
  // Dados do funcionário no mês
  nomeColaborador: varchar("nomeColaborador", { length: 255 }),
  codigoContabil: varchar("codigoContabil", { length: 20 }),
  funcao: varchar("funcao", { length: 100 }),
  dataAdmissao: date("dataAdmissao"),
  salarioBaseHora: varchar("salarioBaseHora", { length: 20 }),
  horasMensais: varchar("horasMensais", { length: 10 }),
  // Adiantamento
  adiantamentoBruto: varchar("adiantamentoBruto", { length: 20 }),
  adiantamentoDescontos: varchar("adiantamentoDescontos", { length: 20 }),
  adiantamentoLiquido: varchar("adiantamentoLiquido", { length: 20 }),
  // Folha
  salarioHorista: varchar("salarioHorista", { length: 20 }),
  dsr: varchar("dsr", { length: 20 }),
  totalProventos: varchar("totalProventos", { length: 20 }),
  totalDescontos: varchar("totalDescontos", { length: 20 }),
  folhaLiquido: varchar("folhaLiquido", { length: 20 }),
  // Encargos
  baseINSS: varchar("baseINSS", { length: 20 }),
  valorINSS: varchar("valorINSS", { length: 20 }),
  baseFGTS: varchar("baseFGTS", { length: 20 }),
  valorFGTS: varchar("valorFGTS", { length: 20 }),
  baseIRRF: varchar("baseIRRF", { length: 20 }),
  valorIRRF: varchar("valorIRRF", { length: 20 }),
  // Extras
  diferencaSalario: varchar("diferencaSalario", { length: 20 }),
  horasExtrasValor: varchar("horasExtrasValor", { length: 20 }),
  vrBeneficio: varchar("vrBeneficio", { length: 20 }),
  // Banco de pagamento
  bancoAdiantamento: varchar("bancoAdiantamento", { length: 100 }),
  bancoFolha: varchar("bancoFolha", { length: 100 }),
  // Custo total do funcionário
  custoTotalMes: varchar("custoTotalMes", { length: 20 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MonthlyPayrollSummary = typeof monthlyPayrollSummary.$inferSelect;
